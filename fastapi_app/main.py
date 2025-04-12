import pandas as pd
from sklearn.linear_model import LinearRegression
import pickle
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# Load the dataset
data = None
try:
    data = pd.read_csv("Student_performance_dataset.csv")
except FileNotFoundError:
    raise FileNotFoundError("Student_performance_dataset.csv not found. Please make sure it is in the same directory.")

# Train the model
model = LinearRegression()
model.fit(data[['StudyHours', 'Attendance']], data['Score'])

# Save the model
filename = "score_prediction_model.pkl"
pickle.dump(model, open(filename, 'wb'))

# Load the model
loaded_model = pickle.load(open(filename, 'rb'))

# Create the FastAPI app
app = FastAPI()

# Define the input data model
class PredictionInput(BaseModel):
    StudyHours: float
    Attendance: float

# Create the prediction endpoint
@app.post("/predict")
async def predict_score(input_data: PredictionInput):
    try:
        study_hours = input_data.StudyHours
        attendance = input_data.Attendance
        print(f"Study hours: {study_hours}, Attendance: {attendance}")
        prediction = loaded_model.predict([[study_hours, attendance]])[0]
        return {"predicted_score": round(prediction, 2)}
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    # You can use uvicorn to run the app locally
    # uvicorn main:app --reload
    pass
