import re
from typing import List, Dict, Any

class ADIFRecord:
    def __init__(self):
        self.fields: Dict[str, str] = {}
        
    def add_field(self, name: str, value: str):
        self.fields[name.upper()] = value
        
    def get(self, name: str, default: str = "") -> str:
        return self.fields.get(name.upper(), default)

def parse_adif(filepath: str) -> List[ADIFRecord]:
    """
    Parser ADIF básico pero robusto (upward compatible).
    """
    records: List[ADIFRecord] = []
    
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except Exception:
        return []

    # Ignorar Header (hasta <EOH>)
    header_end = content.upper().find("<EOH>")
    if header_end != -1:
        content = content[header_end + 5:]

    # Parsear campos
    current_record = ADIFRecord()
    pattern = re.compile(r'<([^:>]+):(\d+)(:[^>]+)?>([^<]*)')
    
    # Esto es una aproximación. Un parser real iteraría buscando las etiquetas correctamente
    # tomando exactamente N bytes según la longitud. Para esta versión v1 simplificada:
    
    pos = 0
    while pos < len(content):
        # Buscar próxima tag
        start_tag = content.find("<", pos)
        if start_tag == -1:
            break
            
        end_tag = content.find(">", start_tag)
        if end_tag == -1:
            break
            
        tag_content = content[start_tag+1:end_tag]
        if tag_content.upper() == "EOR":
            records.append(current_record)
            current_record = ADIFRecord()
            pos = end_tag + 1
            continue
            
        parts = tag_content.split(':')
        if len(parts) >= 2:
            field_name = parts[0]
            try:
                length = int(parts[1])
                value = content[end_tag+1 : end_tag+1+length]
                current_record.add_field(field_name, value)
                pos = end_tag + 1 + length
                continue
            except ValueError:
                pass
                
        pos = end_tag + 1
        
    return records
