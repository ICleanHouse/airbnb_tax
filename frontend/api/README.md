# Frontend API Layer

Domain modules in this folder wrap Django REST endpoints. New UI code should import from these modules instead of calling `apiFetch` directly inside route components.

Keep backend URL paths stable here. If an endpoint changes, update the matching domain function and its callers together.
