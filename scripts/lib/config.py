#!/usr/bin/env python3
import sys
import os
import re
import json

import yaml

def load_config(filepath):
    """
    Parses a YAML file (os-template.yml) natively using PyYAML for robust parser approach.
    Returns a dictionary of dictionaries.
    """
    config = {}
    
    if not os.path.exists(filepath):
        return config

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            parsed = yaml.safe_load(f)
            if parsed:
                config = parsed
    except Exception as e:
        print(f"Error parsing YAML file {filepath}: {e}", file=sys.stderr)

    return config

def get_value(filepath, key_path):
    """
    Get a value by path like 'runtime.mode'
    """
    config = load_config(filepath)
    parts = key_path.split('.')
    
    current = config
    for part in parts:
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None
            
    return current

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python3 config.py <path_to_yaml> <key_path>", file=sys.stderr)
        sys.exit(1)
        
    filepath = sys.argv[1]
    key_path = sys.argv[2]
    
    val = get_value(filepath, key_path)
    
    if val is None:
        print("", end="")
    elif isinstance(val, bool):
        print("true" if val else "false")
    elif isinstance(val, list):
        # Print as a JSON-like array string which is often parsed safely or eval'd by bash
        # Alternatively, just space separated. Let's stick to bash friendly or eval friendly.
        # Actually os-template.yml host_setup_steps is used in bash. If we print the raw array, it might be hard to parse.
        # For simplicity in Bash scripts, we can join them with newlines or spaces. 
        # But in scripts/run, host_setup_steps is only checked for not empty.
        # Let's just output a string representation that bash can check if it's "[]" or not.
        if not val:
            print("[]")
        else:
            print(json.dumps(val))
    else:
        print(str(val))
