import json
import os
from pathlib import Path
import webbrowser
import getpass
import base64
import time

# Path to store the CLI auth token
AUTH_FILE_PATH = Path(__file__).resolve().parents[1] / "cli_auth.json"
LOGIN_URL = "http://localhost:3000/cli-token"

def is_token_expired(token: str) -> bool:
    try:
        # JWT is header.payload.signature
        parts = token.split('.')
        if len(parts) != 3:
            return True
        
        payload = parts[1]
        # Add padding if needed
        padding = len(payload) % 4
        if padding:
            payload += '=' * (4 - padding)
        
        decoded = base64.urlsafe_b64decode(payload)
        data = json.loads(decoded)
        
        exp = data.get('exp')
        if not exp:
            return True
            
        # Check if expired (give 30s buffer)
        return time.time() > (exp - 30)
    except Exception:
        return True

def get_or_prompt_token() -> str:
    """
    Retrieves the authentication token from disk, or prompts the user to login
    via the web dashboard and paste the token.
    """
    if AUTH_FILE_PATH.exists():
        try:
            data = json.loads(AUTH_FILE_PATH.read_text())
            token = data.get("token")
            if token:
                if not is_token_expired(token):
                    return token
                print("Saved token has expired. Re-authenticating.")
        except Exception:
            print("Error reading auth file. Re-authenticating.")

    print("\n=== Authentication Required ===")
    print(f"Please visit the following URL to log in and retrieve your CLI token:\n")
    print(f"  {LOGIN_URL}\n")
    
    try:
        webbrowser.open(LOGIN_URL)
    except:
        pass

    print("Waiting for token input...")
    token = getpass.getpass("Paste your token here (input will be hidden): ").strip()
    
    print("Verifying token...")
    if not token:
        raise RuntimeError("Authentication failed: No token provided.")
    
    if is_token_expired(token):
         print("Warning: The provided token appears to be expired or invalid.")

    # Save the token
    try:
        AUTH_FILE_PATH.write_text(json.dumps({"token": token}, indent=2))
        print(f"Token saved to {AUTH_FILE_PATH}")
    except Exception as e:
        print(f"Warning: Could not save token to disk: {e}")

    print("Successfully authenticated.\n")
    
    return token

def get_token_silent() -> str | None:
    """Returns the token if it exists, otherwise None. Does not prompt."""
    if AUTH_FILE_PATH.exists():
        try:
            data = json.loads(AUTH_FILE_PATH.read_text())
            token = data.get("token")
            if token and not is_token_expired(token):
                return token
        except:
            return None
    return None