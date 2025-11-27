"""
A simple file that takes input from the CLI and sends it to the PostgreSQL database.
Requires the local system running the file to have psycopg2 and sqlalchemy
-> python -m venv my_venv
-> my_venv \ Scripts\ activate (no spaces)
-> pip install sqlalchemy
-> pip install psycopg2
-> python interact_with_db.py
Author: Jason Duong, Yahya Asmara
"""
"""
Uses SQLAlchemy to connect to the database
Imports create_engine as the main entry point into the DB
Imports text to safely inject SQL code into the database
"""
import os
import sys
from sqlalchemy import create_engine, text
#--Set up and connect to DB--
DATABASE_URL = os.environ.get("DATABASE_URL") or "INSERT DATABASE URL"
if not DATABASE_URL or DATABASE_URL == "INSERT DATABASE URL":
    print("DATABASE_URL environment variable is not set. Export it or edit interact_with_db.py with your connection string.")
    sys.exit(1)
db_engine = create_engine(DATABASE_URL)
#----------------------------
print("Connected. Type SQL statements to run them. Type exit to leave.")
while True:
    userInput = input("sql> ").strip()
    if userInput.lower() == "exit":
        break
    if not userInput:
        continue
    try:
        with db_engine.begin() as connection:
            result = connection.execute(text(userInput))
            try:
                rows = result.fetchall()
                if rows:
                    for row in rows:
                        print(row)
                else:
                    print("(no rows)")
            except Exception:
                print("Command successful (committed)")
    except Exception as exc:
        print(f"Error running command: {exc}")

print("Goodbye")