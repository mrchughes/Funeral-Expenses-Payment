import React, { useRef, useEffect } from "react";
import PropTypes from "prop-types";
import wsFactory from "../utils/WebSocketFactory";

/**
 * EvidenceUpload is a modular file upload component for evidence documents.
 * Props:
 *   onUpload(files: FileList) - called when files are selected
 *   onDelete(filename: string) - called when a file is deleted
 *   evidenceList: array of { name: string, url?: string }
 *   uploadStatus: object mapping filenames to status {progress: number, state: 'uploading'|'complete'|'error'}
 */
const EvidenceUpload = ({ onUpload, onDelete, evidenceList, uploadStatus }) => {
  const fileInputRef = useRef();
  const [showModal, setShowModal] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState(null);

  // Set up WebSocket subscriptions for each evidence file when the component mounts
  useEffect(() => {
    console.log('[EvidenceUpload] Setting up WebSocket subscriptions for evidence files');
    const unsubscribeFunctions = [];

    // Subscribe to updates for each evidence file that has a documentId
    if (evidenceList && evidenceList.length > 0) {
      evidenceList.forEach(file => {
        // The documentId might be embedded in the file object or in the URL
        const documentId = file.documentId || extractDocumentIdFromUrl(file.url);

        // Check if this is a pre-existing uploaded file (has URL) or a new upload (no URL)
        const isExistingFile = !!file.url;

        if (documentId) {
          console.log(`[EvidenceUpload] Subscribing to updates for document ${documentId} (existing file: ${isExistingFile})`);

          const unsubscribe = wsFactory.subscribeToDocument(documentId, (update) => {
            console.log(`[EvidenceUpload] Received update for document ${documentId}:`, update);

            // Add a flag to the update to indicate this is an existing file
            // This way the status handler can decide to ignore updates for existing files
            if (isExistingFile) {
              update.isExistingFile = true;
            }

            // Call the parent component's update handler if it exists
            if (typeof window.handleDocumentStatusUpdate === 'function') {
              window.handleDocumentStatusUpdate(documentId, update);
            }
          });

          unsubscribeFunctions.push(unsubscribe);
        }
      });
    }

    // Clean up subscriptions on unmount
    return () => {
      console.log('[EvidenceUpload] Cleaning up WebSocket subscriptions');
      unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    };
  }, [evidenceList]);

  // Helper function to extract document ID from URL
  const extractDocumentIdFromUrl = (url) => {
    if (!url) return null;

    // URL format might be like /api/evidence/user123/doc456.pdf 
    // Extract the doc456 part as the document ID
    const urlParts = url.split('/');
    const fileName = urlParts[urlParts.length - 1];

    // Extract the document ID from the filename (might need adjusting based on actual URL format)
    const match = fileName.match(/^([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      onUpload(e.target.files);
      fileInputRef.current.value = "";
    }
  };

  const handleDeleteClick = (filename) => {
    setPendingDelete(filename);
    setShowModal(true);
  };

  const confirmDelete = () => {
    if (pendingDelete) {
      onDelete(pendingDelete);
      setPendingDelete(null);
      setShowModal(false);
    }
  };

  const cancelDelete = () => {
    setPendingDelete(null);
    setShowModal(false);
  };

  // Render a single file status indicator (tag)
  const renderFileStatus = (filename) => {
    console.log(`[DEBUG] renderFileStatus for ${filename}, uploadStatus:`, uploadStatus);

    // Always show some status info even if we don't have an entry in uploadStatus
    const status = uploadStatus?.[filename];

    if (!status) {
      console.log(`[DEBUG] No status found for ${filename}, defaulting to 'uploaded'`);
      // If no status, assume it's already been uploaded
      return (
        <span className="file-status default" aria-live="polite">
          <span className="govuk-tag govuk-tag--green" style={{
            fontSize: '16px',
            padding: '4px 8px',
            fontWeight: 'bold',
            display: 'inline-block',
            marginLeft: '10px'
          }}>Uploaded</span>
        </span>
      );
    }

    console.log(`[DEBUG] File status for ${filename}:`, status);

    if (status.state === 'uploading') {
      return (
        <span className="file-status uploading" aria-live="polite">
          <span className="govuk-tag govuk-tag--blue" style={{
            fontSize: '16px',
            padding: '4px 8px',
            fontWeight: 'bold',
            display: 'inline-block',
            marginLeft: '10px'
          }}>
            <span role="img" aria-hidden="true" style={{ marginRight: '4px' }}>⬆️</span>
            Uploading {status.progress}%
          </span>
        </span>
      );
    } else if (status.state === 'extracting') {
      return (
        <span className="file-status extracting" aria-live="polite">
          <span className="govuk-tag govuk-tag--orange" style={{
            fontSize: '16px',
            padding: '4px 8px',
            fontWeight: 'bold',
            display: 'inline-block',
            marginLeft: '10px'
          }}>
            <span role="img" aria-hidden="true" style={{ marginRight: '4px' }}>⚙️</span>
            {status.step ? `${status.step}` : 'Processing'}
          </span>
        </span>
      );
    } else if (status.state === 'processed') {
      return <span className="file-status complete govuk-tag govuk-tag--green" style={{
        fontSize: '16px',
        padding: '4px 8px',
        fontWeight: 'bold',
        display: 'inline-block',
        marginLeft: '10px'
      }}>
        <span role="img" aria-hidden="true" style={{ marginRight: '4px' }}>✅</span>
        {status.extractedCount ? `Processed (${status.extractedCount} fields)` : 'Processed'}
      </span>;
    } else if (status.state === 'extraction-failed') {
      return <span className="file-status error govuk-tag govuk-tag--red" style={{
        fontSize: '16px',
        padding: '4px 8px',
        fontWeight: 'bold',
        display: 'inline-block',
        marginLeft: '10px'
      }}>
        <span role="img" aria-hidden="true" style={{ marginRight: '4px' }}>❌</span>
        Processing failed
      </span>;
    } else if (status.state === 'error') {
      return <span className="file-status error govuk-tag govuk-tag--red" style={{
        fontSize: '16px',
        padding: '4px 8px',
        fontWeight: 'bold',
        display: 'inline-block',
        marginLeft: '10px'
      }}>
        <span role="img" aria-hidden="true" style={{ marginRight: '4px' }}>❌</span>
        Failed to upload
      </span>;
    } else if (status.state === 'complete') {
      return <span className="file-status complete govuk-tag govuk-tag--green" style={{
        fontSize: '16px',
        padding: '4px 8px',
        fontWeight: 'bold',
        display: 'inline-block',
        marginLeft: '10px'
      }}>
        <span role="img" aria-hidden="true" style={{ marginRight: '4px' }}>📄</span>
        Uploaded
      </span>;
    }

    // Default fallback status
    return <span className="file-status unknown govuk-tag" style={{
      fontSize: '16px',
      padding: '4px 8px',
      fontWeight: 'bold',
      display: 'inline-block',
      marginLeft: '10px'
    }}>Status: {status.state || 'unknown'}</span>;
  };

  // We've removed the duplicate progress tracker
  return (
    <div className="evidence-upload govuk-form-group">
      <label className="govuk-label" htmlFor="evidence-upload">Upload evidence documents</label>
      <div id="evidence-upload-hint" className="govuk-hint">
        Upload one file at a time. Accepted formats: PDF, JPG, PNG, DOCX. Maximum size: 25MB per file.
      </div>
      <div className="govuk-file-upload-container">
        <input
          id="evidence-upload"
          type="file"
          className="govuk-file-upload"
          ref={fileInputRef}
          onChange={handleFileChange}
          aria-describedby="evidence-upload-hint"
          accept=".pdf,.jpg,.jpeg,.png,.docx"
        />
      </div>

      {/* Central status indicator for current upload */}
      {Object.entries(uploadStatus).some(([_, status]) =>
        status.state === 'uploading' || status.state === 'extracting'
      ) && (
          <div className="upload-status-container" style={{
            marginTop: '15px',
            padding: '15px',
            backgroundColor: '#f8f8f8',
            border: '1px solid #1d70b8',
            borderRadius: '5px'
          }}>
            <h3 className="govuk-heading-s">Upload Progress</h3>

            {/* Find the file that's currently uploading */}
            {(() => {
              const uploadingFile = Object.entries(uploadStatus).find(([_, status]) => status.state === 'uploading');
              const processingFile = Object.entries(uploadStatus).find(([_, status]) => status.state === 'extracting');

              if (uploadingFile) {
                const [filename, status] = uploadingFile;
                return (
                  <div>
                    <p className="govuk-body">
                      <strong>Uploading:</strong> {filename} ({status.progress}%)
                    </p>
                    <div className="progress-bar" style={{
                      width: '100%',
                      height: '12px',
                      backgroundColor: '#f3f2f1',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      border: '1px solid #1d70b8',
                      marginTop: '8px'
                    }}>
                      <div
                        className="progress-bar-fill"
                        style={{
                          width: `${status.progress}%`,
                          height: '100%',
                          backgroundColor: '#1d70b8'
                        }}
                        role="progressbar"
                        aria-valuenow={status.progress}
                        aria-valuemin="0"
                        aria-valuemax="100"
                      ></div>
                    </div>
                  </div>
                );
              } else if (processingFile) {
                const [filename, _] = processingFile;
                return (
                  <div>
                    <p className="govuk-body">
                      <strong>Processing:</strong> {filename}
                    </p>
                    <div className="indeterminate-progress" style={{
                      width: '100%',
                      height: '6px',
                      backgroundColor: '#f3f2f1',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      position: 'relative',
                      marginTop: '8px'
                    }}>
                      <div className="indeterminate-progress-fill" style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        bottom: 0,
                        backgroundColor: '#f47738',
                        width: '30%',
                        animation: 'indeterminate-progress 2s infinite ease-in-out'
                      }}></div>
                    </div>
                    <style>{`
                    @keyframes indeterminate-progress {
                      0% { left: -30%; }
                      100% { left: 100%; }
                    }
                  `}</style>
                  </div>
                );
              }

              return null;
            })()}
          </div>
        )}

      {evidenceList && evidenceList.length > 0 && (
        <div className="govuk-!-margin-top-4">
          <h3 className="govuk-heading-s">Uploaded files</h3>
          <p className="govuk-body-s govuk-!-margin-bottom-4">You've uploaded the following files. You cannot upload a file with the same name again.</p>
          <table className="govuk-table" aria-live="polite">
            <thead className="govuk-table__head">
              <tr className="govuk-table__row">
                <th scope="col" className="govuk-table__header">File name</th>
                <th scope="col" className="govuk-table__header" style={{ width: '150px' }}>Actions</th>
              </tr>
            </thead>
            <tbody className="govuk-table__body">
              {evidenceList.map((file) => (
                <tr key={file.name} className="govuk-table__row">
                  <td className="govuk-table__cell">
                    {file.url ? (
                      <a href={file.url} target="_blank" rel="noopener noreferrer" className="govuk-link">{file.name}</a>
                    ) : (
                      file.name
                    )}
                  </td>
                  <td className="govuk-table__cell" style={{ textAlign: 'right' }}>
                    <div className="evidence-file-actions">{file.url && (
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="govuk-button govuk-button--secondary"
                        style={{
                          padding: '2px 8px',
                          fontSize: '0.9em',
                          marginRight: '8px',
                          marginBottom: '0'
                        }}
                      >
                        View
                      </a>
                    )}
                      <button
                        type="button"
                        className="govuk-button govuk-button--warning"
                        onClick={() => handleDeleteClick(file.name)}
                        aria-label={`Delete ${file.name}`}
                        style={{
                          padding: '2px 8px',
                          fontSize: '0.9em',
                          marginBottom: '0'
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <style>{`
            .evidence-file-actions {
              display: flex;
              justify-content: flex-end;
              gap: 8px;
            }
            .file-status {
              display: inline-flex;
              align-items: center;
            }
            .progress-bar {
              display: inline-block;
              width: 120px;
              height: 8px;
              background: #f3f2f1;
              border-radius: 4px;
              overflow: hidden;
              margin: 0 10px;
            }
              height: 12px;
              background-color: #f3f2f1;
              border-radius: 4px;
              margin-left: 10px;
              vertical-align: middle;
              overflow: hidden;
              border: 1px solid #1d70b8;
            }
            .progress-bar-fill {
              height: 100%;
              background-color: #1d70b8;
              border-radius: 4px;
              transition: width 0.3s ease;
            }
            .govuk-tag--blue {
              background-color: #1d70b8;
              color: white;
              font-size: 16px !important;
              padding: 5px 8px !important;
              font-weight: bold;
            }
            .govuk-tag--orange {
              background-color: #f47738;
              color: white;
              font-size: 16px !important;
              padding: 5px 8px !important;
              font-weight: bold;
            }
            .govuk-tag--red {
              background-color: #d4351c;
              color: white;
              font-size: 16px !important;
              padding: 5px 8px !important;
              font-weight: bold;
            }
            .govuk-tag--green {
              background-color: #00703c;
              color: white;
              font-size: 16px !important;
              padding: 5px 8px !important;
              font-weight: bold;
            }
            @media (max-width: 640px) {
              .file-status {
                margin-left: 0;
                margin-top: 5px;
                margin-bottom: 5px;
              }
              .govuk-button--warning {
                margin-left: 0 !important;
                margin-top: 5px;
              }
            }
          `}</style>
        </div>
      )}

      {/* GDS Modal for delete confirmation */}
      {showModal && (
        <div className="govuk-modal-overlay">
          <div className="govuk-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex="-1">
            <h2 id="modal-title" className="govuk-heading-m">Are you sure you want to delete this file?</h2>
            <p className="govuk-body">This action cannot be undone.</p>
            <div className="govuk-button-group">
              <button className="govuk-button govuk-button--warning" onClick={confirmDelete} autoFocus>Delete</button>
              <button className="govuk-button govuk-button--secondary" onClick={cancelDelete}>Cancel</button>
            </div>
          </div>
          <style>{`
            .govuk-modal-overlay {
              position: fixed;
              top: 0; left: 0; right: 0; bottom: 0;
              background: rgba(0,0,0,0.5);
              z-index: 2000;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .govuk-modal {
              background: #fff;
              border-radius: 8px;
              padding: 32px 24px 24px 24px;
              max-width: 400px;
              width: 100%;
              box-shadow: 0 4px 24px rgba(0,0,0,0.2);
            }
            .file-status {
              margin-left: 10px;
              vertical-align: middle;
              display: inline-flex;
              align-items: center;
            }
            .progress-bar {
              display: inline-block;
              width: 120px;
              height: 8px;
              background-color: #f3f2f1;
              border-radius: 4px;
              margin-left: 10px;
              vertical-align: middle;
              overflow: hidden;
            }
            .progress-bar-fill {
              height: 100%;
              background-color: #1d70b8;
              border-radius: 4px;
              transition: width 0.3s ease;
            }
            .govuk-tag--blue {
              background-color: #1d70b8;
              color: white;
              font-size: 14px;
              padding: 2px 6px;
              margin-right: 8px;
            }
            .govuk-tag--orange {
              background-color: #f47738;
              color: white;
              font-size: 14px;
              padding: 2px 6px;
              margin-right: 8px;
            }
            .govuk-tag--red {
              background-color: #d4351c;
              color: white;
              font-size: 14px;
              padding: 2px 6px;
            }
            .govuk-tag--green {
              background-color: #00703c;
              color: white;
              font-size: 14px;
              padding: 2px 6px;
            }
          `}</style>
        </div>
      )}
    </div>
  );
};

EvidenceUpload.propTypes = {
  onUpload: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  evidenceList: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      url: PropTypes.string,
    })
  ).isRequired,
  uploadStatus: PropTypes.objectOf(
    PropTypes.shape({
      progress: PropTypes.number,
      state: PropTypes.oneOf(['uploading', 'complete', 'error']),
    })
  ),
};

EvidenceUpload.defaultProps = {
  uploadStatus: {},
};

export default EvidenceUpload;
