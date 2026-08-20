# google_drive_authorize.py
#
# Run this ONCE from your local backend machine.
# It opens a browser so you can sign in to the Google account that owns
# or can read the Smart_Railway_AI/inspection_results folder.
#
# The generated token file is then reused by FastAPI and refreshed
# automatically. Do not commit credentials.json or token.json.

import argparse
import os

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow


SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly"
]


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--credentials",
        required=True,
        help="Path to OAuth Desktop client JSON downloaded from Google Cloud.",
    )

    parser.add_argument(
        "--token",
        required=True,
        help="Where to write the authorized user token JSON.",
    )

    args = parser.parse_args()

    credentials_path = os.path.abspath(args.credentials)
    token_path = os.path.abspath(args.token)

    if not os.path.isfile(credentials_path):
        raise FileNotFoundError(
            f"OAuth client JSON not found: {credentials_path}"
        )

    creds = None

    if os.path.isfile(token_path):
        try:
            creds = Credentials.from_authorized_user_file(
                token_path,
                scopes=SCOPES,
            )
        except Exception:
            creds = None

    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except Exception:
            creds = None

    if not creds or not creds.valid:
        flow = InstalledAppFlow.from_client_secrets_file(
            credentials_path,
            scopes=SCOPES,
        )

        creds = flow.run_local_server(
            port=0,
            open_browser=True,
        )

    token_dir = os.path.dirname(token_path)
    if token_dir:
        os.makedirs(token_dir, exist_ok=True)

    with open(token_path, "w", encoding="utf-8") as token_file:
        token_file.write(creds.to_json())

    print()
    print("Google Drive authorization completed.")
    print("Token saved to:")
    print(token_path)
    print()
    print("Keep this token file private and do not commit it to Git.")


if __name__ == "__main__":
    main()