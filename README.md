# ham-radio-doctor

El **Ham Radio Doctor** es una herramienta open-source de diagnóstico, troubleshooting y control de salud basada en evidencia empírica para estaciones de radioaficionado.

La herramienta correlaciona mediciones de RF, niveles de audio, estado CAT, modos digitales (WSJT-X), y diferencias de configuración histórica para explicar por qué tu estación se comporta distinto que ayer, usando evidencia dura y sin invenciones.

## Características Principales

*   **Evidencia antes que Opinión:** Usa la "Evidence Ladder" (Soporta/Contradice/Desconocido) antes de emitir un diagnóstico. No culpa a la propagación ni a la antena por defecto.
*   **Station Snapshots:** Guarda estados "Last Known Good". Pregunta central: *¿Qué cambió desde la última vez que funcionó?*
*   **RX & TX Audio Doctor:** Detecta clipping, offsets, sobremodulación de audio, distorsión por ALC y zumbidos de 50/60Hz en señales.
*   **RF & Antenna Doctor:** Verifica inconsistencias en SWR y potencia (Forward/Reflected). Importa Touchstone (`.s1p`) para analizar corrimientos de resonancia sobre la línea base.
*   **RFI A/B Lab:** Analiza el espectro y compara "Dispositivo apagado vs Dispositivo encendido" aislando interferencias sin requerir ML.
*   **Read-Only por defecto:** Nunca transmite (PTT automático) ni cambia configuración sin aviso.

## Instalación

Es un paquete Python moderno. Se recomienda usar `uv`:

```bash
git clone https://github.com/lorenhey/ham-radio-doctor.git
cd ham-radio-doctor
uv sync
```

## Uso Rápido (CLI)

```bash
# Correr diagnóstico sobre un archivo de audio (detecta clipping, hum)
uv run hrd audio tests/data/overdrive.wav

# Analizar un barrido Touchstone de antena
uv run hrd swr mi_antena_7mhz.s1p

# Correr la demo sintética para ver el motor de reglas en acción
uv run hrd demo
```

## Interfaz Gráfica (GUI)

El proyecto incluye una UI sobria orientada a herramientas de laboratorio:

```bash
uv run hrd-gui
```

## Arquitectura

El núcleo procesa la evidencia en `ham_radio_doctor.core.session.DiagnosticSession` sin interfaz. Las interfaces CLI (`typer`) y GUI (`PySide6`) sólo interactúan con este motor determinista.

## Safety & Licencia

Este software no proporciona consejo médico ni opera equipos por sí solo. Advertencia: Los transmisores de radioaficionado utilizan voltajes peligrosos. Nunca abras hardware energizado basándote en los hallazgos.

Distribuido bajo licencia MIT.
