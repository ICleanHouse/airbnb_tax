from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_datetime
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.calendars.services import find_property_job_conflicts
from apps.marketplace.serializers import CleaningJobSerializer
from apps.properties.models import Property


class CalendarConflictView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "private, no-store"
        response["Pragma"] = "no-cache"
        response["Clear-Site-Data"] = '"cache"'
        return response

    def get(self, request):
        raw_property_id = request.query_params.get("property_id")
        starts_at = parse_datetime(request.query_params.get("starts_at", ""))
        ends_at = parse_datetime(request.query_params.get("ends_at", ""))

        try:
            property_id = int(raw_property_id or "")
        except (TypeError, ValueError):
            property_id = 0
        if property_id <= 0 or not starts_at or not ends_at:
            return Response(
                {"detail": "property_id, starts_at, and ends_at query parameters are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        properties = Property.objects.all()
        if not request.user.is_platform_admin:
            if not request.user.is_active or not request.user.is_approved or not request.user.is_host:
                properties = properties.none()
            else:
                properties = properties.filter(host=request.user)
        property_obj = get_object_or_404(properties, id=property_id)

        if ends_at <= starts_at:
            return Response(
                {"detail": "ends_at must be after starts_at."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        conflicts = find_property_job_conflicts(
            property_id=property_obj.id,
            starts_at=starts_at,
            ends_at=ends_at,
        )
        return Response(CleaningJobSerializer(conflicts, many=True).data)
