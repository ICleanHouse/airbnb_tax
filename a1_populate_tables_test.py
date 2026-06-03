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
    from apps.properties.models import Property, PropertyImage

    rng = random.Random()
    now = timezone.now()
    media_root = Path(settings.MEDIA_ROOT)

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
        ("Лозенец", "Кръстова вада", "бул. Черни връх", "112"),
        ("Младост", "Младост 1", "бул. Андрей Ляпчев", "54"),
        ("Младост", "Младост 4", "бул. Александър Малинов", "78"),
        ("Студентски", "Студентски град", "ул. Акад. Борис Стефанов", "18"),
        ("Витоша", "Манастирски ливади", "бул. Тодор Каблешков", "33"),
        ("Красно село", "Бъкстон", "бул. Цар Борис III", "206"),
        ("Изгрев", "Изток", "бул. Драган Цанков", "36"),
        ("Оборище", "Докторска градина", "ул. Оборище", "41"),
        ("Триадица", "Иван Вазов", "бул. България", "63"),
        ("Овча купел", "Овча купел 2", "бул. Монтевидео", "21"),
        ("Люлин", "Люлин 8", "бул. Панчо Владигеров", "14"),
        ("Надежда", "Надежда 3", "бул. Ломско шосе", "159"),
        ("Подуяне", "Хаджи Димитър", "ул. Резбарска", "27"),
        ("Слатина", "Гео Милев", "бул. Шипченски проход", "19"),
        ("Средец", "Център", "бул. Витоша", "57"),
        ("Дружба", "Дружба 1", "бул. Проф. Цветан Лазаров", "90"),
        ("Връбница", "Обеля 2", "ул. Панайот Хитов", "11"),
        ("Кремиковци", "Челопечене", "Челопеченско шосе", "8"),
    ]

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
    matching_neighborhoods = [item[1] for item in sofia_locations]

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
                work_preference=rng.choice(
                    [CleanerProfile.WorkPreference.FULL_TIME, CleanerProfile.WorkPreference.PART_TIME]
                ),
                job_type_preference=rng.choice(
                    [
                        CleanerProfile.JobTypePreference.ONE_OFF,
                        CleanerProfile.JobTypePreference.ONGOING,
                        CleanerProfile.JobTypePreference.BOTH,
                    ]
                ),
                preferred_time_slots=rng.sample(["morning", "afternoon", "evening"], k=2),
                weekly_availability={
                    "monday": rng.choice(["08:00-12:00", "13:00-17:00"]),
                    "wednesday": rng.choice(["08:00-12:00", "13:00-17:00"]),
                    "friday": rng.choice(["08:00-12:00", "13:00-17:00"]),
                },
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
                notes=f"Host account managing short-term rentals in {rng.choice([x[1] for x in sofia_locations])}.",
            )
            created_users.append(user)
            created_hosts.append(user)

        admin_user = create_confirmed_user(admin_person[0], User.Role.ADMIN)
        created_users.append(admin_user)

        for host in created_hosts:
            property_count = rng.randint(1, 3)
            host_locations = rng.sample(sofia_locations, k=property_count)
            host_addresses: set[str] = set()
            for order, (district, neighborhood, street, number) in enumerate(host_locations):
                address = f"{street} {number}, {district}, Sofia"
                if address in host_addresses:
                    raise ValueError(f"Host {host.email} has duplicate property address: {address}")
                host_addresses.add(address)

                name = f"{rng.choice(property_prefixes)} {rng.choice(property_types)} {district}"
                property_obj = Property.objects.create(
                    host=host,
                    name=name,
                    address=address,
                    city="Sofia",
                    neighborhood=neighborhood,
                    latitude=round(rng.uniform(42.62, 42.74), 6),
                    longitude=round(rng.uniform(23.24, 23.43), 6),
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
    print("Password for all users: 1234*Abv")


if __name__ == "__main__":
    main()
