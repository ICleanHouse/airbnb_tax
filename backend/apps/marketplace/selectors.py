from __future__ import annotations

from django.db.models import CharField, Count, Exists, OuterRef, Q, QuerySet, Subquery, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.accounts.models import AgencyProfile, CleanerProfile, User
from apps.locations.models import City, ServiceZone
from apps.marketplace.models import Assignment, CleanerApplication, CleaningJob


def safe_host_display_name(host: User) -> str:
    """Return a worker-visible host label without falling back to login/contact data."""
    return host.get_full_name().strip() or "Host"


def valid_future_marketplace_jobs(
    queryset: QuerySet[CleaningJob] | None = None,
    *,
    at=None,
) -> QuerySet[CleaningJob]:
    """Shared state base only; endpoint-specific authorization stays separate."""
    queryset = queryset if queryset is not None else CleaningJob.objects.all()
    at = at or timezone.now()
    return queryset.filter(
        status=CleaningJob.Status.OPEN,
        scheduled_start__gt=at,
        host__account_status=User.AccountStatus.APPROVED,
        host__is_active=True,
    )


def user_is_eligible_evaluator(user: User) -> bool:
    if not user.is_authenticated or not user.is_active or not user.is_approved:
        return False
    if user.is_cleaner:
        try:
            profile = user.cleaner_profile
        except CleanerProfile.DoesNotExist:
            return False
        return profile.is_verified
    if user.is_agency:
        try:
            user.agency_profile
        except AgencyProfile.DoesNotExist:
            return False
        return True
    return False


def _legacy_city_subquery(field: str):
    cities = (
        City.objects.filter(is_active=True)
        .filter(
            Q(slug=OuterRef("property__city"))
            | Q(name_bg=OuterRef("property__city"))
            | Q(name_en=OuterRef("property__city"))
        )
        .order_by("sort_order", "pk")
    )
    return Subquery(cities.values(field)[:1], output_field=CharField())


def with_canonical_marketplace_location(queryset: QuerySet[CleaningJob]) -> QuerySet[CleaningJob]:
    """Annotate canonical catalog values without ever returning raw location text."""
    zone_city = "property__service_zone__city__"
    return queryset.select_related("property__service_zone__city").annotate(
        marketplace_city_slug=Coalesce(
            f"{zone_city}slug",
            _legacy_city_subquery("slug"),
            Value(""),
            output_field=CharField(),
        ),
        marketplace_city_name_bg=Coalesce(
            f"{zone_city}name_bg",
            _legacy_city_subquery("name_bg"),
            Value(""),
            output_field=CharField(),
        ),
        marketplace_city_name_en=Coalesce(
            f"{zone_city}name_en",
            _legacy_city_subquery("name_en"),
            Value(""),
            output_field=CharField(),
        ),
    )


def _with_application_state(
    queryset: QuerySet[CleaningJob],
    user: User,
) -> QuerySet[CleaningJob]:
    own_applications = CleanerApplication.objects.filter(job_id=OuterRef("pk"), cleaner=user).exclude(
        status=CleanerApplication.Status.WITHDRAWN
    )
    return queryset.annotate(has_user_application=Exists(own_applications))


def discovery_jobs_for_user(
    user: User,
    queryset: QuerySet[CleaningJob] | None = None,
) -> QuerySet[CleaningJob]:
    queryset = queryset if queryset is not None else CleaningJob.objects.all()
    if not user_is_eligible_evaluator(user):
        return queryset.none()
    return _with_application_state(
        with_canonical_marketplace_location(valid_future_marketplace_jobs(queryset)),
        user,
    )


def application_jobs_for_user(
    user: User,
    queryset: QuerySet[CleaningJob] | None = None,
) -> QuerySet[CleaningJob]:
    """Objects a worker may address when creating a new application."""
    return discovery_jobs_for_user(user, queryset)


def calendar_open_jobs_for_user(
    user: User,
    queryset: QuerySet[CleaningJob] | None = None,
) -> QuerySet[CleaningJob]:
    """Open calendar candidates; exclusion of own records remains calendar-specific."""
    return discovery_jobs_for_user(user, queryset)


def user_has_operational_job_access(user: User, job: CleaningJob) -> bool:
    if user.is_platform_admin or job.host_id == user.id:
        return True
    try:
        assignment = job.assignment
    except Assignment.DoesNotExist:
        return False
    if assignment.cancelled_at is not None:
        return False
    return user.id in {assignment.cleaner_id, assignment.assigned_member_id}


def worker_visible_jobs(
    user: User,
    queryset: QuerySet[CleaningJob] | None = None,
) -> QuerySet[CleaningJob]:
    queryset = queryset if queryset is not None else CleaningJob.objects.all()
    if not user_is_eligible_evaluator(user):
        return queryset.none()

    at = timezone.now()
    future_open = Q(
        status=CleaningJob.Status.OPEN,
        scheduled_start__gt=at,
        host__account_status=User.AccountStatus.APPROVED,
        host__is_active=True,
    )
    if user.is_cleaner:
        assigned = Q(assignment__cancelled_at__isnull=True) & (
            Q(assignment__cleaner=user) | Q(assignment__assigned_member=user)
        )
    else:
        assigned = Q(assignment__cancelled_at__isnull=True, assignment__cleaner=user)

    visible = with_canonical_marketplace_location(queryset.filter(future_open | assigned).distinct())
    return _with_application_state(visible, user)


def canonical_location_values(job: CleaningJob) -> dict[str, str | None]:
    zone = getattr(job.property, "service_zone", None)
    city = getattr(zone, "city", None)
    zone_is_public = _zone_is_canonical(zone)
    return {
        "city_slug": getattr(job, "marketplace_city_slug", "") or getattr(city, "slug", ""),
        "city_name_bg": getattr(job, "marketplace_city_name_bg", "") or getattr(city, "name_bg", ""),
        "city_name_en": getattr(job, "marketplace_city_name_en", "") or getattr(city, "name_en", ""),
        "zone_id": zone.zone_id if zone_is_public else None,
        "zone_name_bg": zone.name_bg if zone_is_public else None,
        "zone_name_en": zone.name_en if zone_is_public else None,
    }


def _zone_is_canonical(zone) -> bool:
    if zone is None or not zone.is_active or not zone.city.is_active:
        return False
    if zone.city.slug != "sofia":
        return False
    if not zone.slug.startswith("osm-"):
        return False
    source_id = zone.slug.removeprefix("osm-")
    return source_id.isdigit() and 1 <= int(source_id) <= 144 and source_id == str(int(source_id))


def _row_has_canonical_zone(row: dict) -> bool:
    if not row["property__service_zone__is_active"]:
        return False
    if not row["property__service_zone__city__is_active"]:
        return False
    city_slug = row["property__service_zone__city__slug"]
    zone_slug = row["property__service_zone__slug"] or ""
    if city_slug != "sofia":
        return False
    if not zone_slug.startswith("osm-"):
        return False
    source_id = zone_slug.removeprefix("osm-")
    return source_id.isdigit() and 1 <= int(source_id) <= 144 and source_id == str(int(source_id))


def _aggregate_demand_rows() -> list[dict]:
    """One-query fast path for jobs already linked to canonical service zones."""
    return list(
        valid_future_marketplace_jobs()
        .order_by()
        .values(
            "property__service_zone_id",
            "property__service_zone__slug",
            "property__service_zone__name_bg",
            "property__service_zone__name_en",
            "property__service_zone__is_active",
            "property__service_zone__sort_order",
            "property__service_zone__city_id",
            "property__service_zone__city__slug",
            "property__service_zone__city__name_bg",
            "property__service_zone__city__name_en",
            "property__service_zone__city__is_active",
            "property__service_zone__city__sort_order",
            "property__city",
            "property__neighborhood",
        )
        .annotate(open_job_count=Count("id"))
    )


def _catalog_for_legacy_demand() -> tuple[list[City], list[ServiceZone]]:
    cities = list(
        City.objects.filter(is_active=True)
        .only("id", "slug", "name_bg", "name_en", "sort_order")
        .order_by("sort_order", "name_bg", "pk")
    )
    zones = list(
        ServiceZone.objects.filter(is_active=True, city__is_active=True)
        .select_related("city")
        .only(
            "id",
            "slug",
            "name_bg",
            "name_en",
            "is_active",
            "sort_order",
            "city__id",
            "city__slug",
            "city__is_active",
        )
        .order_by("city__sort_order", "sort_order", "name_bg", "pk")
    )
    return cities, [zone for zone in zones if _zone_is_canonical(zone)]


def build_public_demand(*, city_identifier: str = "") -> dict[str, list[dict]]:
    """Build canonical aggregate demand without serializing a job or property."""
    rows = _aggregate_demand_rows()
    needs_legacy_catalog = any(not _row_has_canonical_zone(row) for row in rows)

    city_records: dict[int, dict] = {}
    zone_records: dict[int, dict] = {}
    exact_city_names: dict[str, int] = {}
    exact_zone_names: dict[int, dict[str, int | None]] = {}

    if needs_legacy_catalog:
        cities, zones = _catalog_for_legacy_demand()
        for city in cities:
            city_records[city.id] = {
                "id": city.id,
                "slug": city.slug,
                "name_bg": city.name_bg,
                "name_en": city.name_en,
                "sort_order": city.sort_order,
            }
            for name in (city.slug, city.name_bg, city.name_en):
                exact_city_names[name] = city.id
            exact_zone_names[city.id] = {}
        for zone in zones:
            zone_records[zone.id] = {
                "id": zone.id,
                "city_id": zone.city_id,
                "zone_id": zone.zone_id,
                "name_bg": zone.name_bg,
                "name_en": zone.name_en,
                "sort_order": zone.sort_order,
            }
            for name in (zone.name_bg, zone.name_en):
                if name:
                    matches = exact_zone_names[zone.city_id]
                    if name in matches and matches[name] != zone.id:
                        matches[name] = None
                    else:
                        matches[name] = zone.id
    else:
        for row in rows:
            city_id = row["property__service_zone__city_id"]
            zone_id = row["property__service_zone_id"]
            city_records.setdefault(
                city_id,
                {
                    "id": city_id,
                    "slug": row["property__service_zone__city__slug"],
                    "name_bg": row["property__service_zone__city__name_bg"],
                    "name_en": row["property__service_zone__city__name_en"],
                    "sort_order": row["property__service_zone__city__sort_order"],
                },
            )
            zone_records.setdefault(
                zone_id,
                {
                    "id": zone_id,
                    "city_id": city_id,
                    "zone_id": (
                        f"{row['property__service_zone__city__slug']}:"
                        f"{row['property__service_zone__slug']}"
                    ),
                    "name_bg": row["property__service_zone__name_bg"],
                    "name_en": row["property__service_zone__name_en"],
                    "sort_order": row["property__service_zone__sort_order"],
                },
            )

    selected_city = next(
        (city for city in city_records.values() if city["slug"] == city_identifier),
        None,
    ) if city_identifier else None
    if city_identifier and selected_city is None:
        selected = (
            City.objects.filter(is_active=True, slug=city_identifier)
            .values("id", "slug", "name_bg", "name_en", "sort_order")
            .first()
        )
        if selected is None:
            raise City.DoesNotExist
        selected_city = selected
        city_records[selected["id"]] = selected

    buckets: dict[int, dict] = {}
    for row in rows:
        zone_id = None
        if _row_has_canonical_zone(row):
            city_id = row["property__service_zone__city_id"]
            zone_id = row["property__service_zone_id"]
        else:
            city_id = row["property__service_zone__city_id"]
            if city_id not in city_records:
                city_id = exact_city_names.get(row["property__city"])
            if city_id is not None:
                zone_id = exact_zone_names.get(city_id, {}).get(
                    row["property__neighborhood"]
                )
        if city_id is None or city_id not in city_records:
            continue
        if selected_city is not None and city_id != selected_city["id"]:
            continue

        bucket = buckets.setdefault(city_id, {"open_job_count": 0, "zone_counts": {}})
        count = row["open_job_count"]
        bucket["open_job_count"] += count
        if zone_id is not None:
            bucket["zone_counts"][zone_id] = bucket["zone_counts"].get(zone_id, 0) + count

    if selected_city is not None:
        buckets.setdefault(selected_city["id"], {"open_job_count": 0, "zone_counts": {}})

    output = []
    ordered_cities = sorted(
        (city_records[city_id] for city_id in buckets),
        key=lambda city: (city["sort_order"], city["name_bg"], city["id"]),
    )
    for city in ordered_cities:
        bucket = buckets[city["id"]]
        zones = sorted(
            (
                zone_records[zone_id]
                for zone_id, count in bucket["zone_counts"].items()
                if count and zone_id in zone_records
            ),
            key=lambda zone: (zone["sort_order"], zone["name_bg"], zone["id"]),
        )
        output.append(
            {
                "city_slug": city["slug"],
                "city_name_bg": city["name_bg"],
                "city_name_en": city["name_en"],
                "open_job_count": bucket["open_job_count"],
                "zones": [
                    {
                        "zone_id": zone["zone_id"],
                        "zone_name_bg": zone["name_bg"],
                        "zone_name_en": zone["name_en"],
                        "open_job_count": bucket["zone_counts"][zone["id"]],
                    }
                    for zone in zones
                ],
            }
        )
    return {"cities": output}
