import React from 'react';
import './loadingSpinner.css';

const LoadingSpinner = ({ message = "Loading..." }) => {
  return (
    <div className="loading-spinner-overlay">
      <div className="loading-spinner">
        <div className="spinner"></div>
        <p className="loading-message">{message}</p>
      </div>
    </div>
  );
};

export default LoadingSpinner;

