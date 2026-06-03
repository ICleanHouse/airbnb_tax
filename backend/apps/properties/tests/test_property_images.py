from django.core.files.base import ContentFile
from django.test import TestCase

from apps.accounts.models import User
from apps.properties.models import Property, PropertyImage
from apps.properties.serializers import PropertyImageSerializer


class PropertyImageSerializerTests(TestCase):
    def test_image_url_uses_media_path(self):
        host = User.objects.create_user(
            username="host@example.com",
            email="host@example.com",
            password="Password123!",
            role=User.Role.HOST,
            account_status=User.AccountStatus.APPROVED,
        )
        property_obj = Property.objects.create(host=host, name="Flat", city="Sofia")
        image = PropertyImage.objects.create(
            property=property_obj,
            image=ContentFile(b"fake-image", name="property-test.jpg"),
        )

        data = PropertyImageSerializer(image).data

        self.assertTrue(data["image"].startswith("/media/property_images/"))
