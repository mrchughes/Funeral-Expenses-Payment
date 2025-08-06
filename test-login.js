
const axios = require("axios");

async function testLogin() {
  try {
    console.log("Testing login with test@example.com and password123");
    
    const response = await axios.post("http://localhost:5200/api/users/login", {
      email: "test@example.com",
      password: "password123"
    }, {
      headers: {
        "Content-Type": "application/json"
      }
    });
    
    console.log("Login successful:", response.data);
    return response.data;
  } catch (error) {
    console.error("Login failed:", error.message);
    if (error.response) {
      console.error("Response data:", error.response.data);
      console.error("Response status:", error.response.status);
    }
    throw error;
  }
}

testLogin().then(data => {
  console.log("Test complete with data:", data);
}).catch(err => {
  console.error("Test failed with error:", err.message);
});

