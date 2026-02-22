from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

import httpx


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
            "influential_citations": int(influential) if influential is not None else None,
            "altmetric_score": float(altmetric) if altmetric is not None else None,
            "payload_subset": {"source": "manual"},
        }


class OpenAlexMetricsProvider(MetricsProvider):
    provider_name = "openalex"
    _base_url = "https://api.openalex.org/works"

    def fetch_metrics(self, work: dict[str, Any]) -> dict[str, Any]:
        doi = str(work.get("doi", "")).strip()
        if not doi:
            return {
                "provider": self.provider_name,
                "citations_count": 0,
                "influential_citations": None,
                "altmetric_score": None,
                "payload_subset": {"note": "No DOI available."},
            }
        lookup = doi if doi.lower().startswith("https://doi.org/") else f"https://doi.org/{doi}"
        url = f"{self._base_url}/{lookup}"
        with httpx.Client(timeout=10.0) as client:
            response = client.get(url)
            if response.status_code >= 400:
                return {
                    "provider": self.provider_name,
                    "citations_count": 0,
                    "influential_citations": None,
                    "altmetric_score": None,
                    "payload_subset": {
                        "status_code": response.status_code,
                        "note": "OpenAlex lookup unavailable.",
                    },
                }
            payload = response.json()
        cited_by = int(payload.get("cited_by_count", 0) or 0)
        return {
            "provider": self.provider_name,
            "citations_count": cited_by,
            "influential_citations": None,
            "altmetric_score": None,
            "payload_subset": {
                "id": payload.get("id"),
                "cited_by_count": cited_by,
            },
        }


class SemanticScholarMetricsProvider(MetricsProvider):
    provider_name = "semantic_scholar"
    _base_url = "https://api.semanticscholar.org/graph/v1/paper"

    def fetch_metrics(self, work: dict[str, Any]) -> dict[str, Any]:
        doi = str(work.get("doi", "")).strip()
        if not doi:
            return {
                "provider": self.provider_name,
                "citations_count": 0,
                "influential_citations": None,
                "altmetric_score": None,
                "payload_subset": {"note": "No DOI available."},
            }
        url = f"{self._base_url}/DOI:{doi}"
        params = {"fields": "title,citationCount,influentialCitationCount,url"}
        with httpx.Client(timeout=10.0) as client:
            response = client.get(url, params=params)
            if response.status_code >= 400:
                return {
                    "provider": self.provider_name,
                    "citations_count": 0,
                    "influential_citations": None,
                    "altmetric_score": None,
                    "payload_subset": {
                        "status_code": response.status_code,
                        "note": "Semantic Scholar lookup unavailable.",
                    },
                }
            payload = response.json()
        citations = int(payload.get("citationCount", 0) or 0)
        influential = payload.get("influentialCitationCount")
        return {
            "provider": self.provider_name,
            "citations_count": citations,
            "influential_citations": int(influential) if influential is not None else None,
            "altmetric_score": None,
            "payload_subset": {
                "paper_id": payload.get("paperId"),
                "url": payload.get("url"),
                "citation_count": citations,
                "influential_citation_count": influential,
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

