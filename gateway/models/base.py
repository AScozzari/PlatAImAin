import asyncio
import logging
from abc import ABC, abstractmethod
from typing import ClassVar, Optional

logger = logging.getLogger(__name__)


class ModelWrapper(ABC):
    _instance: ClassVar[Optional["ModelWrapper"]] = None
    _lock: ClassVar[asyncio.Lock]
    _loaded: bool = False

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        cls._instance = None
        cls._lock = asyncio.Lock()

    @classmethod
    async def get_instance(cls) -> "ModelWrapper":
        async with cls._lock:
            if cls._instance is None:
                instance = cls.__new__(cls)
                instance._loaded = False
                await asyncio.get_event_loop().run_in_executor(None, instance._load_sync)
                instance._loaded = True
                cls._instance = instance
                logger.info("%s loaded successfully", cls.__name__)
        return cls._instance

    @classmethod
    def get_instance_sync(cls) -> Optional["ModelWrapper"]:
        return cls._instance

    @abstractmethod
    def _load_sync(self) -> None:
        """Load model weights into VRAM. Called in executor thread."""

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    async def health_check(self) -> dict:
        return {"loaded": self._loaded, "model": self.__class__.__name__}
