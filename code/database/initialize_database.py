"""
When this file runs, connects to the Postgre database on Render and configures it
Requires the local system running the file to have psycopg2  and sqlalchemy
-> python -m venv my_venv
-> my_venv \ Scripts\ activate (no spaces)
-> pip install sqlalchemy
-> pip install psycopg2
-> python interact_with_db.py

Author: Jason Duong
"""

"""
Uses SQLAlchemy to connect to the database
Imports create_engine as the main entry point into the DB
Imports text to safely inject SQL code into the database
"""
import os
from pathlib import Path
from sqlalchemy import create_engine, text


def _build_engine():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL environment variable is not set. "
            "Export it before running initialize_database.py"
        )

    return create_engine(database_url)


db_engine = _build_engine()


def _run_schema():
    schema_path = Path(__file__).with_name("database_configurations.sql")
    with schema_path.open("r", encoding="utf-8") as schema_file:
        schema_sql = schema_file.read()

    # use a transaction so the schema is committed automatically
    with db_engine.begin() as connection:
        connection.execute(text(schema_sql))


_run_schema()

print("Initialization Successful")

# open a fresh connection for the interactive CLI
connection_to_db = db_engine.connect()

while True: #While loop. Interact with the DB after initialization
    userInput = input() #Get user input 
    if userInput == "exit": break
    db_output = connection_to_db.execute(text(userInput)) #Execute DB command
    
    try:
        print(db_output.fetchall()) #Grab and print output
    except:
        print("Command Successful")

"""
NOTE: Paste following line if you want to make changes to the DB
-> connection_to_db.commit() # Commit the changes above 
NOTE: The file will, by default, make NO changes to the DB, even if you try to (ex. dropping tables)
"""
connection_to_db.close() # Teardown stuff