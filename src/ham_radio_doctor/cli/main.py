import typer
from rich.console import Console
from rich.table import Table
from typing import Optional

from ham_radio_doctor.diagnostics.audio import analyze_audio_file
from ham_radio_doctor.diagnostics.antenna import analyze_touchstone
from ham_radio_doctor.adapters.adif import parse_adif
from ham_radio_doctor.core.station import StationSnapshot, AudioInterface

app = typer.Typer(
    name="ham-radio-doctor",
    help="Evidence-based troubleshooting for ham radio stations.",
    add_completion=False,
)
console = Console()

@app.command()
def audio(filepath: str):
    """
    Analiza un archivo de audio WAV en busca de problemas de niveles, clipping y hum.
    """
    console.print(f"[bold blue]Analyzing audio file:[/bold blue] {filepath}")
    try:
        results = analyze_audio_file(filepath)
        table = Table(show_header=True, header_style="bold magenta")
        table.add_column("Metric")
        table.add_column("Value")
        
        table.add_row("Sample Rate", f"{results['samplerate']} Hz")
        table.add_row("Duration", f"{results['duration_sec']:.2f} s")
        table.add_row("Peak Level", f"{results['peak_level']:.4f}")
        table.add_row("RMS Level", f"{results['rms_level']:.4f}")
        table.add_row("Clipping", f"{results['clipping_percent']:.2f} %")
        table.add_row("Hum Detected", str(results['hum_detected']))
        if results['hum_detected']:
            table.add_row("Dominant Hum", f"{results['dominant_hum_hz']} Hz")
            
        console.print(table)
        
        if results['clipping_percent'] > 1.0:
            console.print("[bold red]FINDING:[/bold red] Significant clipping detected. Likely TX audio overdrive.")
        
    except Exception as e:
        console.print(f"[bold red]Error analyzing audio:[/bold red] {e}")

@app.command()
def swr(filepath: str):
    """
    Analiza un archivo Touchstone (.s1p) de antena.
    """
    console.print(f"[bold blue]Analyzing SWR from Touchstone:[/bold blue] {filepath}")
    results = analyze_touchstone(filepath)
    if "error" in results:
        console.print(f"[bold red]Error:[/bold red] {results['error']}")
        return
        
    table = Table(title="Antenna Diagnostics", show_header=True, header_style="bold green")
    table.add_column("Metric")
    table.add_column("Value")
    
    table.add_row("Freq Range", f"{results['f_start_hz']/1e6:.3f} - {results['f_stop_hz']/1e6:.3f} MHz")
    table.add_row("Resonance Freq", f"{results['resonance_hz']/1e6:.3f} MHz")
    table.add_row("Minimum SWR", f"{results['resonance_swr']:.2f}")
    if results['bandwidth_2_0_hz']:
        table.add_row("Bandwidth (SWR <= 2)", f"{results['bandwidth_2_0_hz']/1e3:.1f} kHz")
        
    console.print(table)

@app.command()
def diff():
    """
    Compara la configuración actual vs Last Known Good (Demo sintética).
    """
    console.print("[bold cyan]Comparing Station Configurations[/bold cyan]")
    
    good = StationSnapshot(version="v1", description="Last Known Good")
    good.audio_tx = AudioInterface(device_name="USB Audio CODEC")
    
    curr = StationSnapshot(version="v2", description="Current")
    curr.audio_tx = AudioInterface(device_name="Microphone Array (Realtek)")
    
    changes = curr.diff(good)
    if not changes:
        console.print("[green]No changes detected.[/green]")
    else:
        for k, v in changes.items():
            console.print(f"[bold yellow]{k} changed:[/bold yellow]")
            console.print(f"  Old: {v['old']}")
            console.print(f"  New: {v['new']}")

@app.command()
def demo():
    """
    Ejecuta el entorno de demo sintético (Demo 1 - FT8 Failure).
    """
    console.print("[bold magenta]=== HAM RADIO DOCTOR DEMO ===[/bold magenta]")
    console.print("Symptom: FT8 receives but nobody decodes my TX.\n")
    console.print("[blue]Gathering Evidence...[/blue]")
    console.print("- CAT/PTT: Normal (Verified)")
    console.print("- SWR: 1.2 (Unchanged from baseline)")
    console.print("- RF Output: Normal according to meter")
    console.print("- TX Audio: 8.1% clipped samples detected in digital loopback")
    
    console.print("\n[bold green]EVIDENCE LADDER[/bold green]")
    console.print("[bold]Hypothesis: TX Audio Overdrive[/bold]")
    console.print("[+] SUPPORTS: 8.1% clipped samples (Hard finding)")
    console.print("[-] CONTRADICTS: None")
    console.print("[?] UNKNOWN: Actual RF occupied bandwidth\n")
    
    console.print("[bold red]Primary Finding:[/bold red] TX AUDIO OVERDRIVE strongly supported.")
    console.print("[bold yellow]Next Check:[/bold yellow] Reduce TX audio level from OS mixer until ALC drops to zero and verify reports.")

if __name__ == "__main__":
    app()
