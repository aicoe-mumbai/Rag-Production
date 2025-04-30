from pymilvus import connections, Collection
import pandas as pd
from sqlalchemy import create_engine
from dotenv import load_dotenv
import os

load_dotenv()
host = os.getenv("HOST")
port = os.getenv("PORT")
connections.connect(alias="default", host= host, port= port)

# Specify the collection name
collection_name = "seventhfeb"
collection = Collection(name=collection_name)
collection.load()

batch_size = 1000
offset = 0
all_data = []

while True:
    results = collection.query(
        expr="",
        output_fields=["source", "page", "text", "pk"],
        offset=offset,
        limit=batch_size
    )
    if not results:
        break
    all_data.extend(results)
    offset += batch_size

df = pd.DataFrame(all_data)
engine = create_engine('sqlite:///exported_collection.db')
df.to_sql('seventhfeb', con=engine, if_exists='replace', index=False)

print("Data exported to 'exported_collection.db' in the 'QC_Collection_3' table.")
