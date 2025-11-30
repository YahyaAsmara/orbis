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
from sqlalchemy import create_engine, text

#--Set up and connect to DB--
DATABASE_URL = "INSERT DATABASE URL" # Placeholder for when running the file locally during database set up
db_engine = create_engine(DATABASE_URL)
connection_to_db = db_engine.connect()
#----------------------------

connection_to_db.execute(text(open("database_configurations.sql", "r").read())) # Read the configurations file and send it as a command to the DB to execute

print("Initialization Successful")

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
