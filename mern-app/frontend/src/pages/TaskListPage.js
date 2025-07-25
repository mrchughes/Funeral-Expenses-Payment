import React, { useContext, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthContext from '../auth/AuthContext';
import { loadFormData } from '../utils/formPersistence';
import { getResumeData } from '../api';
import {
    STATUS,
    getAllSectionStatuses,
    getOverallProgress,
    hasAnyProgress,
    loadSectionProgress
} from '../utils/formProgress';
import { formSections } from '../data/formStructure';

const TaskListPage = () => {
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    const [formData, setFormData] = useState({});
    const [sectionStatuses, setSectionStatuses] = useState({});
    const [overallProgress, setOverallProgress] = useState(0);

    useEffect(() => {
        const loadDataFromDatabase = async () => {
            if (!user) {
                navigate('/login');
                return;
            }

            try {
                // Load saved form data from database
                const savedData = await getResumeData(user.token);
                let formData = {};

                if (savedData && savedData.formData) {
                    formData = savedData.formData;
                } else {
                    // Fallback to localStorage
                    formData = loadFormData(user.email, {});
                }

                setFormData(formData);

                // Load saved section progress instead of recalculating from formData
                // This preserves completed sections even if formData is incomplete
                const savedSectionProgress = loadSectionProgress(user.email);
                console.log('📋 TaskListPage: Loaded saved section progress:', savedSectionProgress);

                let statuses;
                if (Object.keys(savedSectionProgress).length > 0) {
                    statuses = savedSectionProgress;
                    console.log('📋 TaskListPage: Using saved section progress');
                } else {
                    statuses = getAllSectionStatuses(formData, formSections);
                    console.log('📋 TaskListPage: Calculating fresh section statuses');
                }
                setSectionStatuses(statuses);
                // Calculate overall progress from section statuses, not just formData
                const completedSections = Object.values(statuses).filter(status => status === STATUS.COMPLETED).length;
                const totalSections = formSections.length;
                const progress = Math.round((completedSections / totalSections) * 100);
                setOverallProgress(progress);

                // If no progress, redirect to start of form
                if (!hasAnyProgress(formData, formSections)) {
                    navigate('/form');
                }
            } catch (error) {
                console.warn('Failed to load from database, using localStorage');
                // Fallback to localStorage
                const formData = loadFormData(user.email, {});
                setFormData(formData);

                // Load saved section progress for fallback too
                const savedSectionProgress = loadSectionProgress(user.email);
                let statuses;
                if (Object.keys(savedSectionProgress).length > 0) {
                    statuses = savedSectionProgress;
                } else {
                    statuses = getAllSectionStatuses(formData, formSections);
                }
                setSectionStatuses(statuses);
                const completedSections = Object.values(statuses).filter(status => status === STATUS.COMPLETED).length;
                const totalSections = formSections.length;
                const progress = Math.round((completedSections / totalSections) * 100);
                setOverallProgress(progress);
                if (!hasAnyProgress(formData, formSections)) {
                    navigate('/form');
                }
            }
        };

        loadDataFromDatabase();
    }, [user, navigate]);

    const getStatusText = (status) => {
        switch (status) {
            case STATUS.COMPLETED:
                return 'Completed';
            case STATUS.IN_PROGRESS:
                return 'In progress';
            case STATUS.NOT_STARTED:
            default:
                return 'Not started';
        }
    };

    const getStatusTag = (status) => {
        const baseClasses = 'govuk-tag govuk-task-list__tag';

        switch (status) {
            case STATUS.COMPLETED:
                return `${baseClasses} govuk-tag--green`;
            case STATUS.IN_PROGRESS:
                return `${baseClasses} govuk-tag--blue`;
            case STATUS.NOT_STARTED:
            default:
                return `${baseClasses} govuk-tag--grey`;
        }
    };

    const handleSectionClick = (section) => {
        // Navigate to the specific step for this section
        navigate(`/form?step=${section.step}`);
    };

    const canReview = () => {
        return Object.values(sectionStatuses).every(status => status === STATUS.COMPLETED);
    };

    if (!user) {
        return null;
    }

    return (
        <div className="govuk-width-container">
            <main className="govuk-main-wrapper" id="main-content" role="main">
                <div className="govuk-grid-row">
                    <div className="govuk-grid-column-two-thirds">
                        <h1 className="govuk-heading-xl">
                            Apply for funeral expenses payment
                        </h1>

                        <p className="govuk-body-l">
                            Complete all sections to submit your application.
                        </p>

                        {overallProgress > 0 && (
                            <div className="govuk-inset-text">
                                <p>
                                    <strong>Progress: {overallProgress}% complete</strong>
                                </p>
                                <p>
                                    You can complete the sections in any order.
                                </p>
                            </div>
                        )}

                        <h2 className="govuk-heading-m">Application sections</h2>

                        <ol className="govuk-task-list">
                            {formSections.map((section, idx) => {
                                const status = sectionStatuses[section.id] || STATUS.NOT_STARTED;
                                const isCompleted = status === STATUS.COMPLETED;
                                return (
                                    <li key={section.id} className="govuk-task-list__item govuk-task-list__item--with-link">
                                        <div className="govuk-task-list__name-and-hint">
                                            <button
                                                className="govuk-link govuk-task-list__link"
                                                onClick={() => handleSectionClick({ ...section, step: idx + 1 })}
                                                style={{ background: 'none', border: 'none', padding: 0 }}
                                            >
                                                {section.title}
                                            </button>
                                        </div>
                                        <div className="govuk-task-list__status">
                                            <span className={getStatusTag(status)}>
                                                {getStatusText(status)}
                                            </span>
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>

                        <h2 className="govuk-heading-m">Submit application</h2>

                        <ol className="govuk-task-list">
                            <li className="govuk-task-list__item govuk-task-list__item--with-link">
                                <div className="govuk-task-list__name-and-hint">
                                    {canReview() ? (
                                        <Link
                                            to="/review"
                                            className="govuk-link govuk-task-list__link"
                                        >
                                            Review and submit application
                                        </Link>
                                    ) : (
                                        <span className="govuk-task-list__link" aria-disabled="true">
                                            Review and submit application
                                        </span>
                                    )}
                                    {!canReview() && (
                                        <div className="govuk-hint govuk-task-list__hint">
                                            Complete all sections above before you can review and submit
                                        </div>
                                    )}
                                </div>
                                <div className="govuk-task-list__status">
                                    <span className={`govuk-tag govuk-task-list__tag ${canReview() ? 'govuk-tag--blue' : 'govuk-tag--grey'}`}>
                                        {canReview() ? 'Ready' : 'Cannot start yet'}
                                    </span>
                                </div>
                            </li>
                        </ol>

                        <p className="govuk-body">
                            <Link to="/dashboard" className="govuk-link">
                                Return to dashboard
                            </Link>
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default TaskListPage;
