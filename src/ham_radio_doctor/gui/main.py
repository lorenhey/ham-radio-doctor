import sys
from PySide6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                               QHBoxLayout, QLabel, QPushButton, QTextEdit, QTabWidget)
from PySide6.QtCore import Qt

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Ham Radio Doctor")
        self.resize(800, 600)
        
        # Tema sobrio (Dark mode aproximado)
        self.setStyleSheet("""
            QMainWindow { background-color: #2b2b2b; color: #ffffff; }
            QLabel { color: #ffffff; font-size: 14px; }
            QPushButton { background-color: #3b3b3b; color: #ffffff; border: 1px solid #555; padding: 5px; }
            QPushButton:hover { background-color: #4b4b4b; }
            QTextEdit { background-color: #1e1e1e; color: #00ff00; font-family: monospace; }
            QTabWidget::pane { border: 1px solid #444; }
            QTabBar::tab { background: #333; color: white; padding: 8px; }
            QTabBar::tab:selected { background: #555; }
        """)

        central = QWidget()
        self.setCentralWidget(central)
        main_layout = QVBoxLayout(central)

        # Header
        header = QLabel("Ham Radio Doctor - Evidence-Based Troubleshooting")
        header.setAlignment(Qt.AlignCenter)
        header.setStyleSheet("font-size: 18px; font-weight: bold; margin: 10px;")
        main_layout.addWidget(header)

        # Tabs
        self.tabs = QTabWidget()
        main_layout.addWidget(self.tabs)

        self._setup_dashboard_tab()
        self._setup_station_chain_tab()
        
    def _setup_dashboard_tab(self):
        tab = QWidget()
        layout = QVBoxLayout(tab)
        
        info = QLabel("Diagnostic Session: Active\nNo symptom specified yet.")
        layout.addWidget(info)
        
        btn_layout = QHBoxLayout()
        btn_demo = QPushButton("Run Synthetic Demo")
        btn_demo.clicked.connect(self._run_demo)
        btn_layout.addWidget(btn_demo)
        
        layout.addLayout(btn_layout)
        
        self.log_output = QTextEdit()
        self.log_output.setReadOnly(True)
        layout.addWidget(self.log_output)
        
        self.tabs.addTab(tab, "Dashboard")
        
    def _setup_station_chain_tab(self):
        tab = QWidget()
        layout = QVBoxLayout(tab)
        
        # Representación simplificada de la cadena de señal
        chain = QLabel("PC [Clock ✓] → USB Audio [Clipping !] → Rig [ALC !] → Feedline [?] → Antenna [SWR ✓]")
        chain.setAlignment(Qt.AlignCenter)
        chain.setStyleSheet("font-family: monospace; font-size: 16px;")
        
        layout.addWidget(chain)
        self.tabs.addTab(tab, "Station Chain")

    def _run_demo(self):
        self.log_output.append("--- RUNNING SYNTHETIC DEMO ---")
        self.log_output.append("Gathering Evidence...")
        self.log_output.append("CAT/PTT: Normal")
        self.log_output.append("SWR: 1.2")
        self.log_output.append("TX Audio: 8.1% clipped samples")
        self.log_output.append("=> FINDING: TX AUDIO OVERDRIVE strongly supported.")
        self.log_output.append("Next Check: Reduce TX audio level.")

def main():
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())

if __name__ == "__main__":
    main()
