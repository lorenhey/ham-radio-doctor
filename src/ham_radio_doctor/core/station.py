from typing import Optional, Dict, List, Any
from pydantic import BaseModel, Field

class Rig(BaseModel):
    model: str = "Unknown"
    firmware_version: Optional[str] = None
    capabilities: Dict[str, bool] = Field(default_factory=dict)

class Computer(BaseModel):
    os: str = "Unknown"
    clock_sync: bool = False

class AudioInterface(BaseModel):
    device_name: str
    sample_rate: int = 48000
    channels: int = 2

class Software(BaseModel):
    name: str
    version: str

class StationSnapshot(BaseModel):
    """
    Representa el estado documentado de una estación en un momento dado.
    """
    version: str = "v1"
    description: str = "Default Station"
    rig: Optional[Rig] = None
    computer: Optional[Computer] = None
    audio_tx: Optional[AudioInterface] = None
    audio_rx: Optional[AudioInterface] = None
    software_stack: List[Software] = Field(default_factory=list)
    feedline: Optional[str] = None
    antenna: Optional[str] = None

    def diff(self, other: "StationSnapshot") -> Dict[str, Any]:
        """
        Compara esta snapshot (Current) con otra (Last Known Good) y devuelve las diferencias.
        """
        changes = {}
        if self.audio_tx != other.audio_tx:
            changes["audio_tx"] = {"old": other.audio_tx, "new": self.audio_tx}
        if self.audio_rx != other.audio_rx:
            changes["audio_rx"] = {"old": other.audio_rx, "new": self.audio_rx}
        if self.rig != other.rig:
            changes["rig"] = {"old": other.rig, "new": self.rig}
        if self.antenna != other.antenna:
            changes["antenna"] = {"old": other.antenna, "new": self.antenna}
        return changes
