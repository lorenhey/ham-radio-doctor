from typing import Dict, Any, Optional
import socket

class HamlibAdapter:
    """
    Adapter para interactuar con rigctld. 
    POR DISEÑO: Sólo lectura (Read-Only) por defecto.
    No se transmitirá automáticamente (NO PTT).
    """
    def __init__(self, host: str = "127.0.0.1", port: int = 4532):
        self.host = host
        self.port = port
        self.capabilities: Dict[str, bool] = {
            "frequency": True,
            "mode": True,
            "power": False,
            "swr": False,
            "alc": False
        }

    def _send_command(self, cmd: str) -> Optional[str]:
        """Envía comando crudo a rigctld. Retorna la respuesta."""
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(2.0)
                s.connect((self.host, self.port))
                s.sendall(f"{cmd}\n".encode("utf-8"))
                response = s.recv(1024).decode("utf-8").strip()
                return response
        except Exception:
            return None

    def get_frequency(self) -> Optional[float]:
        resp = self._send_command("f")
        if resp:
            try:
                return float(resp)
            except ValueError:
                pass
        return None

    def get_mode(self) -> Optional[str]:
        resp = self._send_command("m")
        if resp:
            return resp.split("\n")[0]
        return None
        
    def get_ptt_state(self) -> Optional[bool]:
        """
        Retorna True si está en TX, False si está en RX.
        """
        resp = self._send_command("t")
        if resp == "1":
            return True
        elif resp == "0":
            return False
        return None
