import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Landing.css'; // Make sure your Landing.css reflects your desired style

function Landing({ username }) {
  const navigate = useNavigate();

  // When a button is clicked, navigate to the appropriate route
  const handleButtonClick = (option) => {
    sessionStorage.setItem('lastMode', option);  // ✅ Save mode
    if (option === 'qa') {
      navigate('/qa/dashboard');
    } else if (option === 'chat') {
      window.location.href="http://172.16.34.231:8443/"
    }
  };

  return (
    <div className="landing-container">
      <div className="landing-content">
        <h1>Welcome, {username}!</h1>
        <p>Select an option to get started</p>
        <div className="button-container">
          <button className="landing-button" onClick={() => handleButtonClick('qa')}>
            QA
          </button>
          <button className="landing-button" onClick={() => handleButtonClick('chat')}>
            Chat
          </button>
          {/* <button className="landing-button" onClick={() => handleButtonClick('code')}>
            Code
          </button> */}
        </div>
      </div>
    </div>
  );
}

export default Landing;
