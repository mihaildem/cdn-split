"""Provider strategy package and re-exports."""

from app.providers.base import (
    PROVIDERS_REGISTRY,
    BaseProvider,
    ProviderAccountResult,
    ProviderField,
    ProviderHelp,
    ProviderMeta,
    ProviderResourceResult,
    get_all_providers_metadata,
    get_provider_instance,
    get_provider_metadata,
    sync_account_from_provider,
    test_provider_credentials,
    verify_account_credentials,
)

# Import provider implementations to trigger registration
from app.providers import beget, mts, selectel, timeweb, vk, yandex  # noqa: F401

__all__ = [
    "PROVIDERS_REGISTRY",
    "BaseProvider",
    "ProviderAccountResult",
    "ProviderField",
    "ProviderHelp",
    "ProviderMeta",
    "ProviderResourceResult",
    "get_all_providers_metadata",
    "get_provider_instance",
    "get_provider_metadata",
    "sync_account_from_provider",
    "test_provider_credentials",
    "verify_account_credentials",
]
