import json
import os
import random
import sys
import uuid
from datetime import timedelta
from io import BytesIO
from pathlib import Path


def setup_django() -> None:
    repo_root = Path(__file__).resolve().parent
    backend_dir = repo_root / "backend"

    try:
        from dotenv import load_dotenv

        load_dotenv(repo_root / ".env", override=False)
    except ImportError:
        pass

    sys.path.insert(0, str(backend_dir))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

    import django

    django.setup()


def assert_unique_people(label: str, people: list[tuple[str, str, str]]) -> None:
    emails = [email.lower() for email, _, _ in people]
    full_names = [f"{first_name} {last_name}".strip().lower() for _, first_name, last_name in people]

    duplicate_emails = sorted({email for email in emails if emails.count(email) > 1})
    duplicate_names = sorted({name for name in full_names if full_names.count(name) > 1})

    if duplicate_emails or duplicate_names:
        details = []
        if duplicate_emails:
            details.append(f"duplicate emails: {', '.join(duplicate_emails)}")
        if duplicate_names:
            details.append(f"duplicate names: {', '.join(duplicate_names)}")
        raise ValueError(f"{label} must be unique ({'; '.join(details)}).")


def remove_old_seed_property_images(media_root: Path) -> None:
    property_images_dir = media_root / "property_images"
    if not property_images_dir.exists():
        return

    for image_path in property_images_dir.rglob("property_*.*"):
        if image_path.is_file():
            image_path.unlink()


def load_sofia_district_features(repo_root: Path) -> list[dict]:
    geojson_path = repo_root / "districits_sofia" / "sofia_districts_ready.geojson"
    payload = json.loads(geojson_path.read_text(encoding="utf-8"))
    features = payload.get("features")
    if payload.get("type") != "FeatureCollection" or not isinstance(features, list):
        raise ValueError(f"Invalid Sofia district GeoJSON: {geojson_path}")

    source_ids = [str(feature.get("properties", {}).get("id", "")) for feature in features]
    names = [str(feature.get("properties", {}).get("name", "")).strip() for feature in features]
    expected_ids = {str(source_id) for source_id in range(1, 145)}
    if len(features) != 144 or set(source_ids) != expected_ids:
        raise ValueError("Sofia district GeoJSON must contain the stable IDs 1 through 144.")
    if any(not name for name in names) or len(set(names)) != len(names):
        raise ValueError("Sofia district GeoJSON names must be present and unique.")
    return features


def main() -> None:
    setup_django()

    from django.conf import settings
    from django.core.files.base import ContentFile
    from django.db import transaction
    from django.utils import timezone
    from PIL import Image, ImageDraw

    from apps.accounts.models import (
        CleanerProfile,
        CookieConsent,
        HostProfile,
        SignupEmailVerification,
        User,
        hash_signup_email_code,
    )
    from apps.locations.models import City, ServiceZone, ServiceZoneGeometry
    from apps.properties.models import Property, PropertyImage

    rng = random.Random()
    now = timezone.now()
    media_root = Path(settings.MEDIA_ROOT)
    repo_root = Path(__file__).resolve().parent
    sofia_district_features = load_sofia_district_features(repo_root)
    sofia_district_names = [feature["properties"]["name"] for feature in sofia_district_features]

    cleaner_people = [
        ("alina.petrov@example.test", "Alina", "Petrova"),
        ("boris.stefanov@example.test", "Boris", "Stefanov"),
        ("daria.ivanova@example.test", "Daria", "Ivanova"),
        ("emil.georgiev@example.test", "Emil", "Georgiev"),
        ("filip.nikolov@example.test", "Filip", "Nikolov"),
        ("katerina.ivancheva@example.test", "Katerina", "Ivancheva"),
        ("mihail.petkov@example.test", "Mihail", "Petkov"),
        ("nina.velichkova@example.test", "Nina", "Velichkova"),
        ("ognyan.rusev@example.test", "Ognyan", "Rusev"),
    ]
    host_people = [
        ("galia.koleva@example.test", "Galia", "Koleva"),
        ("hugo.marinov@example.test", "Hugo", "Marinov"),
        ("irina.dimitrova@example.test", "Irina", "Dimitrova"),
        ("kiril.popov@example.test", "Kiril", "Popov"),
        ("maria.stoyanova@example.test", "Maria", "Stoyanova"),
        ("nikolay.angelov@example.test", "Nikolay", "Angelov"),
        ("petya.ilieva@example.test", "Petya", "Ilieva"),
        ("rado.todorov@example.test", "Radoslav", "Todorov"),
        ("svetla.georgieva@example.test", "Svetla", "Georgieva"),
        ("teodor.atanasov@example.test", "Teodor", "Atanasov"),
    ]
    admin_person = ("lora.vasileva@example.test", "Lora", "Vasileva")

    all_people = cleaner_people + host_people + [admin_person]
    assert_unique_people("Cleaners", cleaner_people)
    assert_unique_people("Hosts", host_people)
    assert_unique_people("All seeded users", all_people)

    emails = [p[0] for p in all_people]
    people_by_email = {email: (first_name, last_name) for email, first_name, last_name in all_people}

    sofia_locations = [
        ("ж.к. Банишора", "ул. Опълченска", "105", 42.710128, 23.309743),
        ("ж.к. Банишора", "ул. Струга", "38", 42.711454, 23.313271),
        ("ж.к. Банишора", "ул. Охрид", "23", 42.708865, 23.315225),
        ("Център", "бул. Витоша", "57", 42.691905, 23.318792),
        ("Център", "ул. Граф Игнатиев", "34", 42.690814, 23.325719),
        ("Център", "ул. Солунска", "41", 42.692869, 23.319184),
        ("ж.к. Света Троица", "бул. Константин Величков", "83", 42.707469, 23.296855),
        ("ж.к. Света Троица", "ул. Цар Симеон", "271", 42.706234, 23.300497),
        ("ж.к. Света Троица", "ул. Пловдив", "25", 42.710221, 23.294623),
        ("ж.к. Зона Б-18", "бул. Тодор Александров", "121", 42.704716, 23.302557),
        ("ж.к. Зона Б-18", "ул. Позитано", "117", 42.703692, 23.303517),
        ("ж.к. Зона Б-18", "ул. Охридско езеро", "3", 42.705611, 23.301911),
        ("ж.к. Зона Б-5-3", "бул. Тодор Александров", "77", 42.697284, 23.309418),
        ("ж.к. Зона Б-5-3", "ул. Осогово", "60", 42.696461, 23.311292),
        ("ж.к. Зона Б-5-3", "ул. Одрин", "101", 42.695711, 23.310054),
        ("ж.к. Зона Б-5", "бул. Александър Стамболийски", "130", 42.695941, 23.305488),
        ("ж.к. Зона Б-5", "ул. Димитър Петков", "65", 42.695017, 23.303448),
        ("ж.к. Зона Б-5", "ул. Пиротска", "135", 42.697864, 23.306557),
        ("ж.к. Лагера", "бул. Цар Борис III", "93", 42.684972, 23.289712),
        ("ж.к. Лагера", "ул. Житница", "21", 42.686689, 23.296251),
        ("ж.к. Лагера", "ул. Балканджи Йово", "15", 42.682748, 23.291174),
        ("ж.к. Лозенец", "бул. Арсеналски", "67", 42.677936, 23.321834),
        ("ж.к. Лозенец", "ул. Крум Попов", "56", 42.681939, 23.327317),
        ("ж.к. Лозенец", "ул. Богатица", "24", 42.671485, 23.323963),
    ]
    unknown_property_districts = sorted({item[0] for item in sofia_locations} - set(sofia_district_names))
    if unknown_property_districts:
        raise ValueError(f"Property districts are missing from the Sofia GeoJSON: {unknown_property_districts}")

    property_prefixes = ["Sunny", "Urban", "Cosy", "Panorama", "Modern", "Quiet", "Central", "Elegant"]
    property_types = ["Studio", "Apartment", "Loft", "Flat", "Home", "Residence", "Suite", "Nest"]
    property_notes = [
        "Self check-in with lockbox.",
        "Parking spot included in the building.",
        "Quiet hours after 22:00.",
        "Elevator available to all floors.",
        "Pet-friendly with prior notice.",
    ]
    cleaning_notes = [
        "Focus on bathroom and kitchen surfaces.",
        "Replace linens and towels every turnover.",
        "Check consumables and refill if needed.",
        "Vacuum rugs and mop all hard floors.",
        "Take before/after photos for audit.",
    ]
    matching_neighborhoods = sofia_district_names

    photo_palettes = [
        ("#f7f1e8", "#2f6f73", "#e3b04b"),
        ("#eef3f7", "#6b7a8f", "#c76f51"),
        ("#f5efe6", "#3d405b", "#81b29a"),
        ("#f8f4ec", "#8d6e63", "#4f86c6"),
        ("#edf6f2", "#2d5d7b", "#f2cc8f"),
    ]

    def property_photo_bytes(property_index: int, image_index: int) -> bytes:
        wall, accent, light = photo_palettes[(property_index + image_index) % len(photo_palettes)]
        image = Image.new("RGB", (960, 640), wall)
        draw = ImageDraw.Draw(image)

        draw.rectangle((0, 0, 960, 430), fill=wall)
        draw.rectangle((0, 430, 960, 640), fill="#b98f68")
        draw.polygon([(0, 430), (960, 430), (760, 640), (180, 640)], fill="#d2aa84")

        draw.rectangle((54, 60, 424, 322), fill="#fdfdfb", outline=accent, width=14)
        draw.rectangle((82, 88, 396, 294), fill="#a7d3ee")
        draw.rectangle((82, 198, 396, 294), fill="#7db3d5")
        draw.line((239, 88, 239, 294), fill="#fdfdfb", width=10)
        draw.line((82, 194, 396, 194), fill="#fdfdfb", width=10)

        draw.rectangle((540, 130, 870, 408), fill="#4b5563")
        draw.rectangle((570, 165, 840, 380), fill=accent)
        draw.rectangle((594, 192, 816, 354), fill="#f8fafc")
        draw.ellipse((690, 238, 724, 272), fill=light)

        draw.rectangle((105, 365, 525, 520), fill="#625246")
        draw.rectangle((135, 332, 495, 392), fill="#fbf7ef")
        draw.rectangle((130, 392, 215, 535), fill=accent)
        draw.rectangle((415, 392, 500, 535), fill=accent)
        draw.rectangle((585, 472, 860, 535), fill=light)
        draw.rectangle((616, 430, 829, 488), fill="#f7f1e7")
        draw.ellipse((670, 380, 760, 470), fill="#f8fafc", outline=accent, width=8)
        draw.rectangle((680, 470, 750, 535), fill=accent)

        buffer = BytesIO()
        image.save(buffer, format="JPEG", quality=88)
        return buffer.getvalue()

    with transaction.atomic():
        sofia_city, _ = City.objects.update_or_create(
            slug="sofia",
            defaults={
                "name_bg": "София",
                "name_en": "Sofia",
                "country_code": "BG",
                "center_lat": "42.697700",
                "center_lng": "23.321900",
                "default_zoom": 10,
                "is_active": True,
                "sort_order": 1,
            },
        )
        current_sofia_slugs = {f"osm-{feature['properties']['id']}" for feature in sofia_district_features}
        ServiceZone.objects.filter(city=sofia_city).exclude(slug__in=current_sofia_slugs).delete()
        for sort_order, feature in enumerate(sofia_district_features, start=1):
            properties = feature["properties"]
            source_id = str(properties["id"])
            name = properties["name"]
            zone, _ = ServiceZone.objects.update_or_create(
                city=sofia_city,
                slug=f"osm-{source_id}",
                defaults={
                    "name_bg": name,
                    "name_en": properties.get("name:en") or name,
                    "zone_type": "district",
                    "legacy_names": [],
                    "is_active": True,
                    "sort_order": sort_order,
                },
            )
            ServiceZoneGeometry.objects.update_or_create(
                zone=zone,
                defaults={
                    "geometry": feature["geometry"],
                    "simplified_geometry": None,
                    "source": "sofia_districts_ready.geojson",
                    "source_license": "",
                    "source_url": "",
                    "attribution": "© OpenStreetMap contributors",
                },
            )

        # Clean only data created by this script if re-run.
        remove_old_seed_property_images(media_root)
        CookieConsent.objects.filter(user__email__in=emails).delete()
        SignupEmailVerification.objects.filter(email__in=emails).delete()
        User.objects.filter(email__in=emails).delete()

        created_users = []
        created_hosts = []
        created_properties = []

        def create_confirmed_user(email: str, role: str) -> User:
            first_name, last_name = people_by_email[email]
            user = User.objects.create_user(
                username=email,
                email=email,
                password="1234*Abv",
                first_name=first_name,
                last_name=last_name,
                role=role,
                phone_number=f"+35988{rng.randint(1000000, 9999999)}",
                preferred_language=rng.choice([User.Language.BULGARIAN, User.Language.ENGLISH]),
                account_status=User.AccountStatus.APPROVED,
            )
            user.account_status = User.AccountStatus.APPROVED
            user.approved_at = now
            user.email_verified_at = now
            user.phone_verified_at = now
            user.save(
                update_fields=[
                    "account_status",
                    "approved_at",
                    "email_verified_at",
                    "phone_verified_at",
                ]
            )
            return user

        for email, _, _ in cleaner_people:
            user = create_confirmed_user(email, User.Role.CLEANER)
            age = rng.randint(23, 55)
            cleaner_districts = rng.sample(matching_neighborhoods, k=3)
            if not cleaner_districts:
                raise ValueError(f"Cleaner {user.email} must have at least one service district.")
            CleanerProfile.objects.create(
                user=user,
                kind=CleanerProfile.Kind.INDIVIDUAL,
                verification_status=CleanerProfile.VerificationStatus.VERIFIED,
                city="Sofia",
                display_name=f"{user.first_name} {user.last_name}",
                bio=f"Cleaner based in Sofia, serving districts: {', '.join(cleaner_districts[:2])}.",
                service_areas=cleaner_districts,
                sex=rng.choice(
                    [
                        CleanerProfile.Sex.MALE,
                        CleanerProfile.Sex.FEMALE,
                        CleanerProfile.Sex.PREFER_NOT_TO_SAY,
                    ]
                ),
                native_language=rng.choice(["Bulgarian", "English"]),
                other_languages=rng.sample(["Bulgarian", "English", "German", "Spanish"], k=2),
                personal_preferences=rng.sample(
                    ["eco products", "pet friendly", "weekend jobs", "morning shifts"], k=2
                ),
                age=age,
                birth_date=(now - timedelta(days=365 * age)).date(),
                education=rng.choice(
                    [
                        CleanerProfile.Education.NONE,
                        CleanerProfile.Education.PRIMARY,
                        CleanerProfile.Education.HIGH_SCHOOL,
                        CleanerProfile.Education.HIGHER,
                    ]
                ),
                experience_level=rng.choice(
                    [
                        CleanerProfile.ExperienceLevel.ONE_YEAR,
                        CleanerProfile.ExperienceLevel.TWO_YEARS,
                        CleanerProfile.ExperienceLevel.THREE_YEARS,
                        CleanerProfile.ExperienceLevel.FOUR_YEARS,
                        CleanerProfile.ExperienceLevel.FIVE_YEARS,
                    ]
                ),
                has_driving_license=rng.choice([True, False]),
                has_own_car=rng.choice([True, False]),
                smoker=rng.choice([True, False]),
                average_rating=round(rng.uniform(4.1, 5.0), 2),
                completed_jobs_count=rng.randint(3, 120),
            )
            created_users.append(user)

        for email, _, _ in host_people:
            user = create_confirmed_user(email, User.Role.HOST)
            HostProfile.objects.create(
                user=user,
                company_name=f"{user.last_name} Stays",
                city="Sofia",
                notes=f"Host account managing short-term rentals in {rng.choice(sofia_district_names)}.",
            )
            created_users.append(user)
            created_hosts.append(user)

        admin_user = create_confirmed_user(admin_person[0], User.Role.ADMIN)
        created_users.append(admin_user)

        host_property_counts = [3, 3, 2, 2, 2, 1, 1, 1, 1, 1]
        if len(created_hosts) > len(host_property_counts):
            host_property_counts.extend([1] * (len(created_hosts) - len(host_property_counts)))

        for host, property_count in zip(created_hosts, host_property_counts, strict=True):
            host_locations = rng.sample(sofia_locations, k=property_count)
            host_addresses: set[str] = set()
            for neighborhood, street, number, latitude, longitude in host_locations:
                address = f"{street} {number}, {neighborhood}, Sofia"
                if address in host_addresses:
                    raise ValueError(f"Host {host.email} has duplicate property address: {address}")
                host_addresses.add(address)

                name = f"{rng.choice(property_prefixes)} {rng.choice(property_types)} {neighborhood}"
                property_obj = Property.objects.create(
                    host=host,
                    name=name,
                    address=address,
                    city="Sofia",
                    neighborhood=neighborhood,
                    latitude=latitude,
                    longitude=longitude,
                    country="Bulgaria",
                    timezone="Europe/Sofia",
                    description=f"{name} in {neighborhood}, ideal for short and mid-term stays.",
                    bedrooms=rng.randint(1, 4),
                    square_meters=round(rng.uniform(38.0, 145.0), 2),
                    access_notes=rng.choice(property_notes),
                    cleaning_instructions=rng.choice(cleaning_notes),
                    default_cleaning_duration_minutes=rng.choice([90, 120, 150, 180]),
                    default_price_eur=round(rng.uniform(35.0, 140.0), 2),
                )
                created_properties.append(property_obj)

                image_count = rng.randint(2, 4)
                for image_index in range(image_count):
                    file_name = f"property_{property_obj.id}_{image_index + 1}.jpg"
                    PropertyImage.objects.create(
                        property=property_obj,
                        image=ContentFile(property_photo_bytes(property_obj.id, image_index), name=file_name),
                        caption=rng.choice(
                            [
                                "Living room view",
                                "Kitchen detail",
                                "Bedroom setup",
                                "Bathroom layout",
                                "Balcony scene",
                            ]
                        ),
                        order=image_index,
                    )

        for user in created_users:
            SignupEmailVerification.objects.create(
                email=user.email.lower(),
                code_hash=hash_signup_email_code("123456"),
                expires_at=now + timedelta(days=7),
                verified_at=now,
                attempts=rng.randint(0, 2),
            )
            CookieConsent.objects.create(
                user=user,
                visitor_id=f"seed-{uuid.uuid4().hex[:16]}",
                consent_version="v1",
                policy_version="v1",
                essential=True,
                analytics=rng.choice([True, False]),
                marketing=rng.choice([True, False]),
                source=rng.choice(
                    [CookieConsent.Source.BANNER, CookieConsent.Source.ACCOUNT, CookieConsent.Source.API]
                ),
                user_agent="SeederScript/1.0",
                ip_address=f"203.0.113.{rng.randint(1, 254)}",
            )

    print("Populated test data successfully.")
    print(f"Users: {len(created_users)} total ({len(cleaner_people)} cleaners, {len(host_people)} hosts, 1 admin)")
    print(f"Properties created: {len(created_properties)}")
    print(f"Sofia districts synchronized: {len(sofia_district_features)}")
    print("Password for all users: 1234*Abv")


if __name__ == "__main__":
    main()
