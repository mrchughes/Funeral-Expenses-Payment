#!/bin/bash

# Helper script for testing the extraction API with authentication

# Function to generate a token using the default secret
generate_token() {
  local email=$1
  echo "Generating token for $email..."
  node -e "console.log(require('jsonwebtoken').sign({ email: '$email' }, 'secure_jwt_secret_for_authentication_token', { expiresIn: '30d' }))"
}

# Function to register a new user
register_user() {
  local name=$1
  local email=$2
  local password=$3
  echo "Registering user $name ($email)..."
  curl -X POST http://localhost:5200/api/users/register \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"$name\", \"email\": \"$email\", \"password\": \"$password\"}" \
    -o register_response.json
  
  echo "Registration response saved to register_response.json"
}

# Function to login and get a token
login_user() {
  local email=$1
  local password=$2
  echo "Logging in user $email..."
  curl -X POST http://localhost:5200/api/users/login \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"$email\", \"password\": \"$password\"}" \
    -o login_response.json
  
  echo "Login response saved to login_response.json"
}

# Function to test extraction API
test_extraction() {
  local token=$1
  echo "Testing extraction API with token..."
  curl -X POST http://localhost:5200/api/ai-agent/extract \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    -d '{}' \
    -o extraction_response.json
  
  echo "Extraction response saved to extraction_response.json"
}

# Function to upload a file
upload_file() {
  local token=$1
  local file_path=$2
  echo "Uploading file $file_path..."
  curl -X POST http://localhost:5200/api/evidence/upload \
    -H "Authorization: Bearer $token" \
    -F "file=@$file_path" \
    -o upload_response.json
  
  echo "Upload response saved to upload_response.json"
}

# Function to test AI agent directly
test_ai_agent() {
  local file_name=$1
  echo "Testing AI agent directly with $file_name..."
  curl -X POST http://localhost:5100/ai-agent/extract-form-data \
    -H "Content-Type: application/json" \
    -d "{\"files\": [\"$file_name\"]}" \
    -o ai_agent_response.json
  
  echo "AI agent response saved to ai_agent_response.json"
}

# Main menu
show_menu() {
  echo ""
  echo "===== API Testing Helper ====="
  echo "1. Generate token (using default secret)"
  echo "2. Register new user"
  echo "3. Login user"
  echo "4. Test extraction API"
  echo "5. Upload file"
  echo "6. Test AI agent directly"
  echo "7. Exit"
  echo "==========================="
  echo -n "Enter your choice: "
}

# Interactive menu
while true; do
  show_menu
  read choice
  
  case $choice in
    1)
      echo -n "Enter email: "
      read email
      token=$(generate_token "$email")
      echo "Token: $token"
      echo "$token" > current_token.txt
      echo "Token saved to current_token.txt"
      ;;
    2)
      echo -n "Enter name: "
      read name
      echo -n "Enter email: "
      read email
      echo -n "Enter password: "
      read password
      register_user "$name" "$email" "$password"
      ;;
    3)
      echo -n "Enter email: "
      read email
      echo -n "Enter password: "
      read password
      login_user "$email" "$password"
      ;;
    4)
      if [ -f current_token.txt ]; then
        token=$(cat current_token.txt)
        test_extraction "$token"
      else
        echo "No token found. Generate or login first."
      fi
      ;;
    5)
      if [ -f current_token.txt ]; then
        token=$(cat current_token.txt)
        echo -n "Enter file path: "
        read file_path
        upload_file "$token" "$file_path"
      else
        echo "No token found. Generate or login first."
      fi
      ;;
    6)
      echo -n "Enter file name: "
      read file_name
      test_ai_agent "$file_name"
      ;;
    7)
      echo "Exiting..."
      exit 0
      ;;
    *)
      echo "Invalid choice. Please try again."
      ;;
  esac
done
