from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime, timezone
import re
import time
from typing import Any
from urllib.parse import quote

import httpx

RETRYABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}
REQUEST_RETRY_COUNT = 2
REQUEST_RETRY_BASE_DELAY_SECONDS = 0.35


def _openalex_abstract_from_inverted_index(value: Any) -> str | None:
    if not isinstance(value, dict):
        return None
    tokens_with_positions: list[tuple[int, str]] = []
    for token, positions in value.items():
        if not isinstance(token, str) or not isinstance(positions, list):
            continue
        for position in positions:
            if isinstance(position, int) and position >= 0:
                tokens_with_positions.append((position, token))
    if not tokens_with_positions:
        return None
    tokens_with_positions.sort(key=lambda item: item[0])
    abstract = re.sub(
        r"\s+",
        " ",
        " ".join(token for _, token in tokens_with_positions).strip(),
    )
    return abstract or None


def _openalex_counts_by_year(value: Any) -> list[dict[str, int]]:
    if not isinstance(value, list):
        return []
    normalized: list[dict[str, int]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        year_raw = item.get("year")
        count_raw = item.get("cited_by_count")
        try:
            year = int(year_raw)
            count = int(count_raw)
        except (TypeError, ValueError):
            continue
        if year < 1900:
            continue
        normalized.append(
            {
                "year": year,
                "cited_by_count": max(0, count),
            }
        )
    normalized.sort(key=lambda row: row["year"])
    return normalized


class MetricsProvider(ABC):
    provider_name: str

    @abstractmethod
    def fetch_metrics(self, work: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError


class ManualMetricsProvider(MetricsProvider):
    provider_name = "manual"

    def fetch_metrics(self, work: dict[str, Any]) -> dict[str, Any]:
        citations = int(work.get("manual_citations_count", 0) or 0)
        influential = work.get("manual_influential_citations")
        altmetric = work.get("manual_altmetric_score")
        return {
            "provider": self.provider_name,
            "citations_count": citations,
            "influential_citations": int(influential)
            if influential is not None
            else None,
            "altmetric_score": float(altmetric) if altmetric is not None else None,
            "payload_subset": {"source": "manual"},
        }


class OpenAlexMetricsProvider(MetricsProvider):
    provider_name = "openalex"
    _base_url = "https://api.openalex.org/works"

    @staticmethod
    def _normalize_title(value: str) -> str:
        return re.sub(r"[^a-z0-9]+", " ", (value or "").strip().lower()).strip()

    @classmethod
    def _title_similarity(cls, expected: str, observed: str) -> float:
        expected_tokens = set(cls._normalize_title(expected).split())
        observed_tokens = set(cls._normalize_title(observed).split())
        if not expected_tokens or not observed_tokens:
            return 0.0
        overlap = len(expected_tokens & observed_tokens)
        return overlap / max(1, len(expected_tokens))

    @staticmethod
    def _normalize_doi(value: str | None) -> str:
        clean = re.sub(r"\s+", "", (value or "").strip()).lower()
        if clean.startswith("https://doi.org/"):
            clean = clean.removeprefix("https://doi.org/")
        return clean

    @staticmethod
    def _extract_pmid(value: Any) -> str:
        text = str(value or "").strip()
        if not text:
            return ""
        if text.isdigit():
            return text
        patterns = [
            re.compile(r"pubmed\.ncbi\.nlm\.nih\.gov/(\d+)", re.IGNORECASE),
            re.compile(r"/pubmed/(\d+)", re.IGNORECASE),
            re.compile(r"pmid[:\s]+(\d+)", re.IGNORECASE),
        ]
        for pattern in patterns:
            match = pattern.search(text)
            if match:
                return match.group(1)
        return ""

    @staticmethod
    def _request_with_retry(
        client: httpx.Client,
        *,
        url: str,
        params: dict[str, Any],
    ) -> httpx.Response:
        response: httpx.Response | None = None
        for attempt in range(REQUEST_RETRY_COUNT + 1):
            response = client.get(url, params=params)
            if (
                response.status_code not in RETRYABLE_STATUS_CODES
                or attempt >= REQUEST_RETRY_COUNT
            ):
                return response
            time.sleep(REQUEST_RETRY_BASE_DELAY_SECONDS * (attempt + 1))
        return response if response is not None else client.get(url, params=params)

    def _best_match_from_search(
        self,
        *,
        title: str,
        year: int | None,
        results: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        best: dict[str, Any] | None = None
        best_score = 0.0
        for candidate in results:
            candidate_title = str(candidate.get("display_name", "")).strip()
            if not candidate_title:
                continue
            score = self._title_similarity(title, candidate_title)
            candidate_year = candidate.get("publication_year")
            if year is not None and isinstance(candidate_year, int):
                if abs(candidate_year - year) <= 1:
                    score += 0.12
                elif abs(candidate_year - year) > 3:
                    score -= 0.12
            if score > best_score:
                best_score = score
                best = candidate
        if best is None or best_score < 0.65:
            return None
        return best

    def fetch_metrics(self, work: dict[str, Any]) -> dict[str, Any]:
        doi = self._normalize_doi(str(work.get("doi", "")).strip())
        title = str(work.get("title", "")).strip()
        year_raw = work.get("year")
        year = int(year_raw) if str(year_raw).strip().isdigit() else None
        pmid = self._extract_pmid(work.get("pmid") or work.get("url"))

        with httpx.Client(timeout=12.0) as client:
            try:
                candidate: dict[str, Any] | None = None
                match_method = ""
                if doi:
                    response = self._request_with_retry(
                        client,
                        url=self._base_url,
                        params={"filter": f"doi:https://doi.org/{doi}", "per-page": 1},
                    )
                    if response.status_code < 400:
                        payload = response.json()
                        results = payload.get("results") or []
                        if results:
                            candidate = results[0]
                            match_method = "doi"
                if candidate is None and pmid:
                    response = self._request_with_retry(
                        client,
                        url=self._base_url,
                        params={"filter": f"pmid:{pmid}", "per-page": 1},
                    )
                    if response.status_code < 400:
                        payload = response.json()
                        results = payload.get("results") or []
                        if results:
                            candidate = results[0]
                            match_method = "pmid"
                if candidate is None and title:
                    response = self._request_with_retry(
                        client,
                        url=self._base_url,
                        params={
                            "search": title,
                            "per-page": 5,
                            "sort": "cited_by_count:desc",
                        },
                    )
                    if response.status_code >= 400:
                        raise RuntimeError(
                            f"OpenAlex search failed ({response.status_code})."
                        )
                    payload = response.json()
                    results = payload.get("results") or []
                    candidate = self._best_match_from_search(
                        title=title,
                        year=year,
                        results=[item for item in results if isinstance(item, dict)],
                    )
                    if candidate is not None:
                        match_method = "title"
                if candidate is None:
                    note = (
                        "No DOI/PMID/title match available."
                        if not doi and not pmid and not title
                        else "No confident OpenAlex match."
                    )
                    return {
                        "provider": self.provider_name,
                        "citations_count": 0,
                        "influential_citations": None,
                        "altmetric_score": None,
                        "payload_subset": {"note": note},
                    }
            except Exception as exc:
                return {
                    "provider": self.provider_name,
                    "citations_count": 0,
                    "influential_citations": None,
                    "altmetric_score": None,
                    "payload_subset": {
                        "note": "OpenAlex lookup unavailable.",
                        "error": str(exc),
                    },
                }

        cited_by = int(candidate.get("cited_by_count", 0) or 0)
        openalex_id = candidate.get("id")
        cited_by_api_url = candidate.get("cited_by_api_url")
        ids = candidate.get("ids") or {}
        pmid_value = ids.get("pmid")
        primary_location = candidate.get("primary_location") or {}
        source = primary_location.get("source") or {}
        summary_stats = source.get("summary_stats") or {}
        journal_2yr_mean_citedness = summary_stats.get("2yr_mean_citedness")
        abstract = _openalex_abstract_from_inverted_index(
            candidate.get("abstract_inverted_index")
        )
        counts_by_year = _openalex_counts_by_year(candidate.get("counts_by_year"))
        return {
            "provider": self.provider_name,
            "citations_count": cited_by,
            "influential_citations": None,
            "altmetric_score": None,
            "payload_subset": {
                "id": openalex_id,
                "cited_by_count": cited_by,
                "cited_by_api_url": cited_by_api_url,
                "match_method": match_method,
                "pmid": pmid_value,
                "journal_2yr_mean_citedness": journal_2yr_mean_citedness,
                "journal_name": source.get("display_name"),
                "abstract": abstract,
                "counts_by_year": counts_by_year,
            },
        }


class SemanticScholarMetricsProvider(MetricsProvider):
    provider_name = "semantic_scholar"
    _base_url = "https://api.semanticscholar.org/graph/v1/paper"

    @staticmethod
    def _normalize_title(value: str) -> str:
        return re.sub(r"[^a-z0-9]+", " ", (value or "").strip().lower()).strip()

    @classmethod
    def _title_similarity(cls, expected: str, observed: str) -> float:
        expected_tokens = set(cls._normalize_title(expected).split())
        observed_tokens = set(cls._normalize_title(observed).split())
        if not expected_tokens or not observed_tokens:
            return 0.0
        overlap = len(expected_tokens & observed_tokens)
        return overlap / max(1, len(expected_tokens))

    @staticmethod
    def _normalize_doi(value: str | None) -> str:
        clean = re.sub(r"\s+", "", (value or "").strip()).lower()
        if clean.startswith("https://doi.org/"):
            clean = clean.removeprefix("https://doi.org/")
        return clean

    @staticmethod
    def _extract_pmid(value: Any) -> str:
        text = str(value or "").strip()
        if not text:
            return ""
        if text.isdigit():
            return text
        patterns = [
            re.compile(r"pubmed\.ncbi\.nlm\.nih\.gov/(\d+)", re.IGNORECASE),
            re.compile(r"/pubmed/(\d+)", re.IGNORECASE),
            re.compile(r"pmid[:\s]+(\d+)", re.IGNORECASE),
        ]
        for pattern in patterns:
            match = pattern.search(text)
            if match:
                return match.group(1)
        return ""

    @staticmethod
    def _request_with_retry(
        client: httpx.Client,
        *,
        url: str,
        params: dict[str, Any] | None = None,
    ) -> httpx.Response:
        response: httpx.Response | None = None
        for attempt in range(REQUEST_RETRY_COUNT + 1):
            response = client.get(url, params=params)
            if (
                response.status_code not in RETRYABLE_STATUS_CODES
                or attempt >= REQUEST_RETRY_COUNT
            ):
                return response
            time.sleep(REQUEST_RETRY_BASE_DELAY_SECONDS * (attempt + 1))
        return response if response is not None else client.get(url, params=params)

    def _best_match_from_search(
        self,
        *,
        title: str,
        year: int | None,
        candidates: list[dict[str, Any]],
    ) -> tuple[dict[str, Any] | None, float]:
        best: dict[str, Any] | None = None
        best_score = 0.0
        for item in candidates:
            candidate_title = str(item.get("title", "")).strip()
            if not candidate_title:
                continue
            score = self._title_similarity(title, candidate_title)
            candidate_year = item.get("year")
            if year is not None and isinstance(candidate_year, int):
                if abs(candidate_year - year) <= 1:
                    score += 0.12
                elif abs(candidate_year - year) > 3:
                    score -= 0.12
            if score > best_score:
                best_score = score
                best = item
        return best, best_score

    def fetch_metrics(self, work: dict[str, Any]) -> dict[str, Any]:
        doi = self._normalize_doi(str(work.get("doi", "")).strip())
        title = str(work.get("title", "")).strip()
        year_raw = work.get("year")
        year = int(year_raw) if str(year_raw).strip().isdigit() else None
        pmid = self._extract_pmid(work.get("pmid") or work.get("url"))

        with httpx.Client(timeout=12.0) as client:
            try:
                payload: dict[str, Any] | None = None
                match_method = ""
                if doi:
                    url = f"{self._base_url}/DOI:{quote(doi, safe='')}"
                    response = self._request_with_retry(
                        client,
                        url=url,
                        params={
                            "fields": "title,year,citationCount,influentialCitationCount,url,paperId,abstract"
                        },
                    )
                    if response.status_code < 400:
                        payload = response.json()
                        match_method = "doi"
                if payload is None and pmid:
                    response = self._request_with_retry(
                        client,
                        url=f"{self._base_url}/PMID:{quote(pmid, safe='')}",
                        params={
                            "fields": "title,year,citationCount,influentialCitationCount,url,paperId,abstract"
                        },
                    )
                    if response.status_code < 400:
                        payload = response.json()
                        match_method = "pmid"

                if payload is None and title:
                    response = self._request_with_retry(
                        client,
                        url=f"{self._base_url}/search",
                        params={
                            "query": title,
                            "limit": 5,
                            "fields": "title,year,citationCount,influentialCitationCount,url,paperId,abstract",
                        },
                    )
                    if response.status_code >= 400:
                        raise RuntimeError(
                            f"Semantic Scholar search failed ({response.status_code})."
                        )
                    search_payload = response.json()
                    candidates = search_payload.get("data") or []
                    best, score = self._best_match_from_search(
                        title=title,
                        year=year,
                        candidates=[
                            item for item in candidates if isinstance(item, dict)
                        ],
                    )
                    if best is not None and score >= 0.65:
                        payload = best
                        match_method = "title"

                if payload is None:
                    note = (
                        "No DOI/PMID/title match available."
                        if not doi and not pmid and not title
                        else "No confident Semantic Scholar match."
                    )
                    return {
                        "provider": self.provider_name,
                        "citations_count": 0,
                        "influential_citations": None,
                        "altmetric_score": None,
                        "payload_subset": {"note": note},
                    }
            except Exception as exc:
                return {
                    "provider": self.provider_name,
                    "citations_count": 0,
                    "influential_citations": None,
                    "altmetric_score": None,
                    "payload_subset": {
                        "note": "Semantic Scholar lookup unavailable.",
                        "error": str(exc),
                    },
                }

        citations = int(payload.get("citationCount", 0) or 0)
        influential = payload.get("influentialCitationCount")
        return {
            "provider": self.provider_name,
            "citations_count": citations,
            "influential_citations": int(influential)
            if influential is not None
            else None,
            "altmetric_score": None,
            "payload_subset": {
                "paper_id": payload.get("paperId"),
                "url": payload.get("url"),
                "citation_count": citations,
                "influential_citation_count": influential,
                "match_method": match_method,
                "captured_year": datetime.now(timezone.utc).year,
                "abstract": re.sub(
                    r"\s+", " ", str(payload.get("abstract", "")).strip()
                )
                or None,
            },
        }


def get_metrics_provider(name: str) -> MetricsProvider:
    normalized = (name or "").strip().lower()
    if normalized == "openalex":
        return OpenAlexMetricsProvider()
    if normalized in {"semantic_scholar", "semanticscholar"}:
        return SemanticScholarMetricsProvider()
    if normalized == "manual" or not normalized:
        return ManualMetricsProvider()
    raise ValueError("provider must be one of: openalex, semantic_scholar, manual")
