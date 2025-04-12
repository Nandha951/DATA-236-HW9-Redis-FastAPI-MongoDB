const express = require('express');
const mongoose = require('mongoose');
const redis = require('redis');
const axios = require('axios');
const fs = require('fs');
const csv = require('csv-parser');

const app = express();
const port = 3000;

// MongoDB Connection
const mongoUrl = 'mongodb://localhost:27017/student_db';
mongoose.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('Connected to MongoDB');
    // Load data from CSV after connecting to MongoDB
    checkIfDataExistsAndLoad();
  })
  .catch(err => console.error('MongoDB connection error:', err));

const studentSchema = new mongoose.Schema({
  Student_Name: String,
  Study_hours: Number,
  Attendance: Number,
  Score: Number
});

const Student = mongoose.model('Student', studentSchema);

// Redis Connection
const redisClient = redis.createClient({
  host: 'redis-server',
  port: 6379
});

redisClient.on('connect', () => console.log('Connected to Redis'));
redisClient.on('error', err => console.error('Redis connection error:', err));

redisClient.connect().catch(console.error)

// Express middleware to parse JSON
app.use(express.json());

// Function to fetch student records from MongoDB
async function fetchStudentRecords() {
  try {
    const students = await Student.find();
    console.log('Data served from MongoDB:', students);
    return students;
  } catch (error) {
    console.error('Error fetching student records from MongoDB:', error);
    throw error;
  }
}

// Function to store student records in Redis
async function storeStudentRecordsInRedis(students) {
  try {
    await redisClient.set('students', JSON.stringify(students));
    console.log('Student records stored in Redis');
  } catch (error) {
    console.error('Error storing student records in Redis:', error);
    throw error;
  }
}

// Function to get student records from Redis
async function getStudentRecordsFromRedis() {
  try {
    const students = await redisClient.get('students');
    if (students) {
      console.log('Data served from Redis:', students);
      return JSON.parse(students);
    }
    return null;
  } catch (error) {
    console.error('Error getting student records from Redis:', error);
    return null;
  }
}

// GET API to fetch all student records
app.get('/students', async (req, res) => {
  try {
    let students = await getStudentRecordsFromRedis();
    if (!students) {
      students = await fetchStudentRecords();
      await storeStudentRecordsInRedis(students);
    }
    res.json(students);
  } catch (error) {
    console.error('Error fetching student records:', error);
    res.status(500).json({ error: 'Failed to fetch student records' });
  }
});

// PUT API to update a student's record
app.put('/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { Student_Name, Study_hours, Attendance, Score } = req.body;

    // Find the student by ID and update their record
    const updatedStudent = await Student.findByIdAndUpdate(
      id,
      { Student_Name, Study_hours, Attendance, Score },
      { new: true } // Return the updated document
    );

    if (!updatedStudent) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Clear the Redis cache to ensure the next GET request fetches updated data
    await redisClient.del('students');

    res.json(updatedStudent);
  } catch (error) {
    console.error('Error updating student record:', error);
    res.status(500).json({ error: 'Failed to update student record' });
  }
});

// FastAPI Endpoint
const fastAPIEndpoint = 'http://localhost:8000/predict';

// POST API to predict score
app.post('/predict', async (req, res) => {
  try {
    let StudyHours = req.body.StudyHours;
    let Attendance = req.body.Attendance;
    if (StudyHours === undefined || Attendance === undefined) {
      return res.status(400).json({ error: 'Missing StudyHours or Attendance' });
    }
    StudyHours = parseFloat(StudyHours);
    Attendance = parseFloat(Attendance);
    console.log(`Sending to FastAPI: StudyHours=${StudyHours}, Attendance=${Attendance}`);
    const response = await axios.post(fastAPIEndpoint, { StudyHours, Attendance });
    res.json(response.data);
  } catch (error) {
    console.error('Error predicting score:', error);
    res.status(500).json({ error: 'Failed to predict score' });
  }
});

// Load data from CSV file
async function loadDataFromCSV() {
  const results = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream('../fastapi_app/Student_performance_dataset.csv')
      .pipe(csv())
      .on('data', (data) => {
        results.push({
          Student_Name: "Unknown",
          Study_hours: parseFloat(data.StudyHours),
          Attendance: parseFloat(data.Attendance),
          Score: parseFloat(data.Score),
        });
      })
      .on('end', async () => {
        try {
          await Student.insertMany(results)
            .then(() => {
              console.log('Data loaded from CSV into MongoDB');
              resolve();
            })
            .catch(err => {
              console.error('Error inserting data:', err);
              reject(err);
            });
        } catch (error) {
          console.error('Error loading data from CSV into MongoDB:', error);
          reject(error);
        }
      });
  });
}

async function checkIfDataExistsAndLoad() {
  try {
    const count = await Student.countDocuments();
    if (count === 0) {
      console.log('No data found in MongoDB, loading from CSV...');
      await loadDataFromCSV();
    } else {
      console.log('Data already exists in MongoDB, skipping CSV load.');
    }
  } catch (error) {
    console.error('Error checking data existence:', error);
  }
}

app.listen(port, () => {
  console.log(`Node.js app listening at http://localhost:${port}`);
});