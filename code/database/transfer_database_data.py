"""
When this file runs, connects to a Postgre database on Render and transfers its data to another database.

Author: 
"""

"""
Uses SQLAlchemy to connect to the database
Imports create_engine as the main entry point into the DB
Imports text to safely inject SQL code into the database
"""
from sqlalchemy import create_engine, text

#--Set up and connect to DB--
FROM_DATABASE_URL = "INSERT DATABASE URL" # Placeholder for when running the file locally during database set up
TO_DATABASE_URL = "INSERT DATABASE URL" # Placeholder for when running the file locally during database set up
db_engine = create_engine(DATABASE_URL)
connection_to_db = db_engine.connect()
#----------------------------
