from typing import Dict, Any

class WSJTXAdapter:
    """
    Adapter para interactuar con WSJT-X.
    Lee mensajes UDP. Versión simplificada.
    """
    def __init__(self, port: int = 2237):
        self.port = port
        
    def get_status(self) -> Dict[str, Any]:
        """
        Retorna el último estado recibido de WSJT-X.
        Mock para v1.
        """
        return {
            "dial_frequency": 7074000.0,
            "mode": "FT8",
            "dx_call": "",
            "tx_enabled": False,
            "transmitting": False,
            "decodes": 15
        }
