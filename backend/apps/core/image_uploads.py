from __future__ import annotations

import base64
import binascii
import re
import uuid
import warnings
from dataclasses import dataclass
from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError


@dataclass(frozen=True)
class ImagePolicy:
    max_input_bytes: int
    max_dimension: int
    max_pixels: int
    output_size: tuple[int, int]
    resize_mode: str
    jpeg_quality: int


# Property photos may be larger originals, but are always reduced for Stage 1 use.
PROPERTY_IMAGE_POLICY = ImagePolicy(
    max_input_bytes=10 * 1024 * 1024,
    max_dimension=8_192,
    max_pixels=40_000_000,
    output_size=(2_048, 2_048),
    resize_mode="contain",
    jpeg_quality=85,
)

# Cleaner images are public profile data and retain the established square crop.
CLEANER_IMAGE_POLICY = ImagePolicy(
    max_input_bytes=2 * 1024 * 1024,
    max_dimension=8_192,
    max_pixels=40_000_000,
    output_size=(720, 720),
    resize_mode="cover",
    jpeg_quality=85,
)

ALLOWED_DECODED_FORMATS = frozenset({"JPEG", "PNG", "WEBP"})
_DATA_URL_PATTERN = re.compile(
    r"\Adata:image/(?:jpeg|jpg|png|webp);base64,(?P<payload>[A-Za-z0-9+/]*={0,2})\Z",
    re.IGNORECASE,
)
_PUBLIC_MESSAGES = {
    "en": "The image is invalid. Choose a JPEG, PNG, or WebP image within the size limit.",
    "bg": "Изображението е невалидно. Изберете JPEG, PNG или WebP файл в допустимия размер.",
}


@dataclass(frozen=True)
class ImageUploadValidationError(Exception):
    reason_code: str


@dataclass(frozen=True)
class NormalizedImage:
    content: bytes
    filename: str


def request_language(request) -> str:
    if request is None:
        return "en"
    preferred = getattr(getattr(request, "user", None), "preferred_language", "")
    if preferred in {"bg", "en"}:
        return preferred
    accepted = request.META.get("HTTP_ACCEPT_LANGUAGE", "").casefold()
    return "bg" if accepted.startswith("bg") else "en"


def public_image_error(language: str) -> dict[str, str]:
    return {
        "code": "invalid_image",
        "detail": _PUBLIC_MESSAGES.get(language, _PUBLIC_MESSAGES["en"]),
    }


def _read_uploaded_bytes(uploaded_file, policy: ImagePolicy) -> bytes:
    declared_size = getattr(uploaded_file, "size", None)
    if declared_size is not None and declared_size > policy.max_input_bytes:
        raise ImageUploadValidationError("encoded_size_exceeded")
    if declared_size == 0:
        raise ImageUploadValidationError("empty_image")

    chunks: list[bytes] = []
    total = 0
    for chunk in uploaded_file.chunks(chunk_size=64 * 1024):
        total += len(chunk)
        if total > policy.max_input_bytes:
            raise ImageUploadValidationError("encoded_size_exceeded")
        chunks.append(chunk)
    content = b"".join(chunks)
    if not content:
        raise ImageUploadValidationError("empty_image")
    return content


def _fresh_rgb_buffer(image: Image.Image) -> Image.Image:
    if "A" in image.getbands():
        rgba = image.convert("RGBA")
        background = Image.new("RGBA", rgba.size, "white")
        background.alpha_composite(rgba)
        rgb = background.convert("RGB")
    else:
        rgb = image.convert("RGB")
    clean = Image.new("RGB", rgb.size)
    clean.paste(rgb)
    return clean


def normalize_image_bytes(content: bytes, policy: ImagePolicy) -> NormalizedImage:
    if not content or len(content) > policy.max_input_bytes:
        reason = "empty_image" if not content else "encoded_size_exceeded"
        raise ImageUploadValidationError(reason)

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as probe:
                image_format = (probe.format or "").upper()
                if image_format not in ALLOWED_DECODED_FORMATS:
                    raise ImageUploadValidationError("unsupported_format")
                width, height = probe.size
                if width <= 0 or height <= 0:
                    raise ImageUploadValidationError("invalid_dimensions")
                if width > policy.max_dimension or height > policy.max_dimension:
                    raise ImageUploadValidationError("dimension_exceeded")
                if width * height > policy.max_pixels:
                    raise ImageUploadValidationError("pixel_count_exceeded")
                if getattr(probe, "n_frames", 1) != 1 or getattr(probe, "is_animated", False):
                    raise ImageUploadValidationError("animated_image")
                probe.verify()

            with Image.open(BytesIO(content)) as decoded:
                decoded.load()
                oriented = ImageOps.exif_transpose(decoded)
                clean = _fresh_rgb_buffer(oriented)

        if policy.resize_mode == "cover":
            rendered = ImageOps.fit(
                clean,
                policy.output_size,
                method=Image.Resampling.LANCZOS,
                centering=(0.5, 0.5),
            )
        else:
            rendered = clean.copy()
            rendered.thumbnail(policy.output_size, Image.Resampling.LANCZOS)

        final_pixels = Image.new("RGB", rendered.size)
        final_pixels.paste(rendered)
        output = BytesIO()
        final_pixels.save(
            output,
            format="JPEG",
            quality=policy.jpeg_quality,
            optimize=True,
        )
    except ImageUploadValidationError:
        raise
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        UnidentifiedImageError,
        OSError,
        SyntaxError,
        ValueError,
        MemoryError,
    ) as exc:
        raise ImageUploadValidationError("decode_failed") from exc

    return NormalizedImage(
        content=output.getvalue(),
        filename=f"{uuid.uuid4().hex}.jpg",
    )


def normalize_uploaded_image(uploaded_file, policy: ImagePolicy) -> NormalizedImage:
    return normalize_image_bytes(_read_uploaded_bytes(uploaded_file, policy), policy)


def normalize_cleaner_image_data_url(value: str) -> str:
    match = _DATA_URL_PATTERN.fullmatch(value)
    if match is None:
        raise ImageUploadValidationError("invalid_data_url")
    payload = match.group("payload")
    maximum_base64_length = ((CLEANER_IMAGE_POLICY.max_input_bytes + 2) // 3) * 4
    if len(payload) > maximum_base64_length:
        raise ImageUploadValidationError("encoded_size_exceeded")
    try:
        content = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ImageUploadValidationError("invalid_data_url") from exc
    normalized = normalize_image_bytes(content, CLEANER_IMAGE_POLICY)
    encoded = base64.b64encode(normalized.content).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"
