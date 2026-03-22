from __future__ import annotations

import base64
from dataclasses import dataclass
from io import BytesIO
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps


@dataclass(slots=True)
class SaxAssistConfig:
    center_x_pct: float = 50.0
    center_y_pct: float = 50.0
    inner_radius_pct: float = 18.0
    outer_radius_pct: float = 34.0
    enhancement_threshold: float = 1.6


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _load_image_bytes(content: bytes) -> Image.Image:
    image = Image.open(BytesIO(content))
    image = ImageOps.exif_transpose(image)
    image = image.convert("L")
    max_dim = 960
    if max(image.size) > max_dim:
        scale = max_dim / max(image.size)
        image = image.resize(
            (max(1, int(round(image.width * scale))), max(1, int(round(image.height * scale)))),
            Image.Resampling.LANCZOS,
        )
    return image.filter(ImageFilter.GaussianBlur(radius=1.0))


def _image_to_array(image: Image.Image) -> np.ndarray:
    return np.asarray(image, dtype=np.float32) / 255.0


def _resize_for_alignment(arr: np.ndarray, max_dim: int = 192) -> tuple[np.ndarray, float]:
    image = Image.fromarray((arr * 255).clip(0, 255).astype(np.uint8), mode="L")
    scale = min(max_dim / image.width, max_dim / image.height, 1.0)
    if scale == 1.0:
        return arr, 1.0
    resized = image.resize(
        (max(48, int(round(image.width * scale))), max(48, int(round(image.height * scale)))),
        Image.Resampling.BILINEAR,
    )
    return _image_to_array(resized), scale


def _edge_map(arr: np.ndarray) -> np.ndarray:
    grad_x = np.zeros_like(arr)
    grad_y = np.zeros_like(arr)
    grad_x[:, 1:] = np.abs(np.diff(arr, axis=1))
    grad_y[1:, :] = np.abs(np.diff(arr, axis=0))
    return grad_x + grad_y


def _central_crop(arr: np.ndarray, margin_ratio: float = 0.1) -> np.ndarray:
    height, width = arr.shape
    margin_y = int(round(height * margin_ratio))
    margin_x = int(round(width * margin_ratio))
    return arr[margin_y : height - margin_y, margin_x : width - margin_x]


def _translation_slices(height: int, width: int, dx: int, dy: int) -> tuple[slice, slice, slice, slice] | None:
    src_y0 = max(0, -dy)
    src_y1 = min(height, height - dy)
    dst_y0 = max(0, dy)
    dst_y1 = min(height, height + dy)
    src_x0 = max(0, -dx)
    src_x1 = min(width, width - dx)
    dst_x0 = max(0, dx)
    dst_x1 = min(width, width + dx)

    if src_y0 >= src_y1 or src_x0 >= src_x1:
        return None

    return (
        slice(src_y0, src_y1),
        slice(src_x0, src_x1),
        slice(dst_y0, dst_y1),
        slice(dst_x0, dst_x1),
    )


def _alignment_score(reference: np.ndarray, moving: np.ndarray, dx: int, dy: int) -> float:
    slices = _translation_slices(reference.shape[0], reference.shape[1], dx, dy)
    if slices is None:
        return float("inf")
    src_y, src_x, dst_y, dst_x = slices
    ref_overlap = reference[dst_y, dst_x]
    mov_overlap = moving[src_y, src_x]
    return float(np.mean(np.abs(ref_overlap - mov_overlap)))


def _find_translation(reference: np.ndarray, moving: np.ndarray) -> tuple[int, int]:
    ref_small, scale = _resize_for_alignment(reference)
    mov_small, _ = _resize_for_alignment(moving)
    ref_edges = _central_crop(_edge_map(ref_small))
    mov_edges = _central_crop(_edge_map(mov_small))

    best_dx = 0
    best_dy = 0
    best_score = float("inf")
    for dy in range(-18, 19, 2):
        for dx in range(-18, 19, 2):
            score = _alignment_score(ref_edges, mov_edges, dx, dy)
            if score < best_score:
                best_score = score
                best_dx = dx
                best_dy = dy

    if scale != 0:
        return int(round(best_dx / scale)), int(round(best_dy / scale))
    return best_dx, best_dy


def _apply_translation(arr: np.ndarray, dx: int, dy: int) -> np.ndarray:
    fill_value = float(np.median(arr))
    translated = np.full_like(arr, fill_value)
    slices = _translation_slices(arr.shape[0], arr.shape[1], dx, dy)
    if slices is None:
        return translated
    src_y, src_x, dst_y, dst_x = slices
    translated[dst_y, dst_x] = arr[src_y, src_x]
    return translated


def _build_annulus_mask(height: int, width: int, config: SaxAssistConfig) -> tuple[np.ndarray, dict[str, float]]:
    center_x_pct = _clamp(config.center_x_pct, 25.0, 75.0)
    center_y_pct = _clamp(config.center_y_pct, 25.0, 75.0)
    inner_radius_pct = _clamp(config.inner_radius_pct, 6.0, 40.0)
    outer_radius_pct = _clamp(config.outer_radius_pct, inner_radius_pct + 4.0, 48.0)

    center_x = width * center_x_pct / 100.0
    center_y = height * center_y_pct / 100.0
    base_radius = min(height, width)
    inner_radius = base_radius * inner_radius_pct / 100.0
    outer_radius = base_radius * outer_radius_pct / 100.0

    yy, xx = np.mgrid[0:height, 0:width]
    distances = np.sqrt((xx - center_x) ** 2 + (yy - center_y) ** 2)
    mask = (distances >= inner_radius) & (distances <= outer_radius)

    return mask, {
        "center_x_pct": round(center_x_pct, 1),
        "center_y_pct": round(center_y_pct, 1),
        "inner_radius_pct": round(inner_radius_pct, 1),
        "outer_radius_pct": round(outer_radius_pct, 1),
    }


def _robust_scale(values: np.ndarray) -> tuple[float, float]:
    median = float(np.median(values))
    mad = float(np.median(np.abs(values - median))) * 1.4826
    return median, max(mad, 0.08)


def _cleanup_mask(mask: np.ndarray) -> np.ndarray:
    working = mask.astype(np.uint8)
    padded = np.pad(working, 1)
    neighbors = np.zeros_like(working, dtype=np.uint8)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            neighbors += padded[1 + dy : 1 + dy + working.shape[0], 1 + dx : 1 + dx + working.shape[1]]
    return mask & (neighbors >= 4)


def _candidate_sectors(mask: np.ndarray, roi_mask: np.ndarray, center_x: float, center_y: float) -> list[dict[str, Any]]:
    yy, xx = np.mgrid[0:mask.shape[0], 0:mask.shape[1]]
    angles = (np.degrees(np.arctan2(center_y - yy, xx - center_x)) + 360.0) % 360.0
    sectors = [
        ("Anterior", (45.0, 135.0)),
        ("Lateral", (135.0, 225.0)),
        ("Inferior", (225.0, 315.0)),
        ("Septal", (315.0, 360.0)),
        ("Septal", (0.0, 45.0)),
    ]

    totals: dict[str, float] = {}
    for name, (start, end) in sectors:
        sector_mask = roi_mask & (angles >= start) & (angles < end)
        denom = float(sector_mask.sum())
        if denom <= 0:
            continue
        coverage = float(mask[sector_mask].sum()) / denom * 100.0
        if name in totals:
            totals[name] = max(totals[name], coverage)
        else:
            totals[name] = coverage

    return [
        {"label": name, "coverage_pct": round(coverage, 1)}
        for name, coverage in sorted(totals.items(), key=lambda item: item[1], reverse=True)
        if coverage >= 2.0
    ]


def _to_data_url(image: Image.Image) -> str:
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def _grayscale_image(arr: np.ndarray) -> Image.Image:
    return Image.fromarray((arr.clip(0.0, 1.0) * 255).astype(np.uint8), mode="L")


def _difference_heatmap(delta: np.ndarray, roi_mask: np.ndarray) -> Image.Image:
    positive = np.clip(delta, 0.0, None)
    if positive[roi_mask].size > 0:
        peak = float(np.percentile(positive[roi_mask], 98))
    else:
        peak = 1.0
    scale = max(peak, 1.0)
    normalized = np.clip(positive / scale, 0.0, 1.0)

    red = (normalized * 255).astype(np.uint8)
    green = (np.clip(normalized - 0.25, 0.0, 1.0) * 220).astype(np.uint8)
    blue = np.zeros_like(red)
    rgb = np.stack([red, green, blue], axis=-1)
    rgb[~roi_mask] = np.array([240, 240, 240], dtype=np.uint8)
    return Image.fromarray(rgb, mode="RGB")


def _candidate_overlay(post_arr: np.ndarray, candidate_mask: np.ndarray, roi_mask: np.ndarray, config: dict[str, float]) -> Image.Image:
    base = np.stack([(post_arr * 255).astype(np.uint8)] * 3, axis=-1)
    overlay = base.copy()
    overlay[roi_mask] = np.clip(overlay[roi_mask] * 0.92 + np.array([8, 8, 8]), 0, 255)
    overlay[candidate_mask] = np.array([207, 74, 74], dtype=np.uint8)
    image = Image.fromarray(overlay.astype(np.uint8), mode="RGB")

    draw = ImageDraw.Draw(image)
    width, height = image.size
    cx = width * config["center_x_pct"] / 100.0
    cy = height * config["center_y_pct"] / 100.0
    base_radius = min(width, height)
    inner = base_radius * config["inner_radius_pct"] / 100.0
    outer = base_radius * config["outer_radius_pct"] / 100.0
    draw.ellipse((cx - inner, cy - inner, cx + inner, cy + inner), outline=(214, 160, 84), width=2)
    draw.ellipse((cx - outer, cy - outer, cx + outer, cy + outer), outline=(214, 160, 84), width=2)
    return image


def analyse_sax_pair(pre_content: bytes, post_content: bytes, config: SaxAssistConfig) -> dict[str, Any]:
    pre_image = _load_image_bytes(pre_content)
    post_image = _load_image_bytes(post_content).resize(pre_image.size, Image.Resampling.LANCZOS)

    pre_arr = _image_to_array(pre_image)
    post_arr = _image_to_array(post_image)

    shift_x, shift_y = _find_translation(pre_arr, post_arr)
    aligned_post = _apply_translation(post_arr, shift_x, shift_y)

    roi_mask, normalized_config = _build_annulus_mask(pre_arr.shape[0], pre_arr.shape[1], config)
    center_x_px = pre_arr.shape[1] * normalized_config["center_x_pct"] / 100.0
    center_y_px = pre_arr.shape[0] * normalized_config["center_y_pct"] / 100.0

    pre_median, pre_scale = _robust_scale(pre_arr[roi_mask])
    post_median, post_scale = _robust_scale(aligned_post[roi_mask])

    pre_norm = (pre_arr - pre_median) / pre_scale
    post_norm = (aligned_post - post_median) / post_scale
    delta = post_norm - pre_norm

    candidate_mask = roi_mask & (post_norm >= 1.0) & (delta >= _clamp(config.enhancement_threshold, 0.5, 4.0))
    candidate_mask = _cleanup_mask(candidate_mask)

    candidate_fraction_pct = float(candidate_mask.sum()) / max(float(roi_mask.sum()), 1.0) * 100.0
    mean_delta = float(delta[roi_mask].mean()) if roi_mask.any() else 0.0

    if candidate_fraction_pct < 0.8:
        confidence = "Not obvious"
    elif candidate_fraction_pct < 3.0:
        confidence = "Possible"
    else:
        confidence = "Likely"

    sectors = _candidate_sectors(candidate_mask, roi_mask, center_x_px, center_y_px)

    return {
        "roi": {
            **normalized_config,
            "enhancement_threshold": round(_clamp(config.enhancement_threshold, 0.5, 4.0), 2),
        },
        "registration": {
            "shift_x_px": shift_x,
            "shift_y_px": shift_y,
            "note": "Post-contrast image translated to match pre-contrast structure.",
        },
        "metrics": {
            "confidence": confidence,
            "candidate_fraction_pct": round(candidate_fraction_pct, 2),
            "mean_delta": round(mean_delta, 2),
            "roi_mean_pre": round(float(pre_arr[roi_mask].mean()), 3),
            "roi_mean_post": round(float(aligned_post[roi_mask].mean()), 3),
        },
        "suggested_sectors": sectors,
        "notes": [
            "Experimental SAX assist only.",
            "Sector labels assume standard short-axis orientation.",
            "Candidate overlay should be reviewed manually before any interpretation.",
        ],
        "images": {
            "aligned_pre": _to_data_url(_grayscale_image(pre_arr).convert("RGB")),
            "aligned_post": _to_data_url(_grayscale_image(aligned_post).convert("RGB")),
            "difference_map": _to_data_url(_difference_heatmap(delta, roi_mask)),
            "candidate_overlay": _to_data_url(_candidate_overlay(aligned_post, candidate_mask, roi_mask, normalized_config)),
        },
    }
