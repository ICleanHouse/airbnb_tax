import logging

from rest_framework import status, viewsets
from rest_framework.response import Response

from apps.feedback.models import Review
from apps.feedback.serializers import ReviewSerializer
from apps.feedback.services import FeedbackError, submit_review


logger = logging.getLogger("apps.feedback")


class ReviewViewSet(viewsets.ModelViewSet):
    serializer_class = ReviewSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = Review.objects.select_related("job", "reviewer", "reviewee", "job__host")
        if user.is_platform_admin:
            return queryset
        return queryset.filter(reviewer=user) | queryset.filter(reviewee=user, is_private_issue=False)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            review = submit_review(
                job=serializer.validated_data["job"],
                reviewer=request.user,
                reviewee=serializer.validated_data["reviewee"],
                rating=serializer.validated_data["rating"],
                comment=serializer.validated_data.get("comment", ""),
                private_note=serializer.validated_data.get("private_note", ""),
                is_private_issue=serializer.validated_data.get("is_private_issue", False),
                request=request,
            )
        except FeedbackError as exc:
            logger.warning(
                "Review submission blocked",
                extra={"event": "review.submit_blocked", "metadata": {"reason": str(exc)}},
            )
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(review).data, status=status.HTTP_201_CREATED)
