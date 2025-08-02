// Check for use_agent=true in URL params to enable agent-based implementation
$(document).ready(function () {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('use_agent')) {
        console.log("Enabling agent-based chat implementation");
        window.useAgentImplementation = true;

        // Add indicator to the UI
        $('#agent-indicator').html('<span style="background-color: #1d70b8; color: white; padding: 5px 10px; border-radius: 5px;">Agent Mode Active</span>');

        // Set up the agent-based chat implementation
        setupAgentChat();
    }
});

// Function to setup agent-based chat
function setupAgentChat() {
    // Handle form submission
    $('#message-form').submit(function (e) {
        e.preventDefault();

        const messageInput = $('#message-input');
        const message = messageInput.val().trim();

        if (message) {
            // Clear the input field
            messageInput.val('');

            // Disable the send button and show the processing indicator
            $('#send-button').prop('disabled', true);
            $('#processing-indicator').css('display', 'flex');

            // Add the user message to the chat
            $('#chat-messages').append(`
                <div class="message user-message">
                    <strong>You:</strong> ${message}
                </div>
            `);

            // Scroll to bottom
            scrollToBottom();

            // Get the conversation history for context
            const conversationHistory = getConversationHistory();

            // Check if web search is requested
            const useWebSearch = $('#use-web-search').prop('checked');

            // Use the agent-based endpoint
            $.ajax({
                url: '/ai-agent/agent-chat',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    input: message,
                    history: conversationHistory,
                    use_web_search: useWebSearch
                }),
                success: function (data) {
                    // Handle successful response
                    if (data.success) {
                        // Format source information if available
                        let sourceHtml = '';
                        if (data.source) {
                            let sourceLabel = data.source;
                            let badgeClass = 'govuk-tag';

                            // Style the badge based on source
                            if (sourceLabel.includes('rag')) {
                                badgeClass += ' govuk-tag--blue';
                                sourceLabel = 'FEP Policy';
                            } else if (sourceLabel.includes('web')) {
                                badgeClass += ' govuk-tag--green';
                                sourceLabel = 'Web Search';
                            } else if (sourceLabel.includes('direct_llm')) {
                                badgeClass += ' govuk-tag--grey';
                                sourceLabel = 'General Knowledge';
                            } else if (sourceLabel.includes('fallback')) {
                                badgeClass += ' govuk-tag--red';
                            }

                            sourceHtml = `<span class="${badgeClass}">${sourceLabel}</span>`;

                            // Add sources and timing
                            if (data.sources && data.sources.length > 0) {
                                sourceHtml += ' Sources: ' + data.sources.join(', ');
                            }
                            if (data.processing_time) {
                                sourceHtml += ` <span class="govuk-hint">(${data.processing_time.toFixed(2)}s)</span>`;
                            }
                        }

                        // Add the bot's response
                        $('#chat-messages').append(`
                            <div class="message ai-message">
                                <strong>AI:</strong> ${data.response}
                                <div class="source-info">${sourceHtml}</div>
                            </div>
                        `);
                    } else {
                        // Error in response
                        $('#chat-messages').append(`
                            <div class="message ai-message">
                                <strong>AI:</strong> Sorry, I encountered an error: ${data.error || 'Unknown error'}
                            </div>
                        `);
                    }

                    // Re-enable the send button and hide the processing indicator
                    $('#send-button').prop('disabled', false);
                    $('#processing-indicator').css('display', 'none');

                    // Scroll to bottom
                    scrollToBottom();
                },
                error: function (xhr, status, error) {
                    // Handle AJAX error
                    console.error('Error:', error);
                    $('#chat-messages').append(`
                        <div class="message ai-message">
                            <strong>AI:</strong> Sorry, there was an error processing your request. Please try again later.
                        </div>
                    `);

                    // Re-enable the send button and hide the processing indicator
                    $('#send-button').prop('disabled', false);
                    $('#processing-indicator').css('display', 'none');

                    // Scroll to bottom
                    scrollToBottom();
                }
            });
        }
    });

    // Handle Enter key in textarea
    $('#message-input').keydown(function (e) {
        if (e.keyCode === 13 && !e.shiftKey) {
            e.preventDefault();
            $('#message-form').submit();
        }
    });

    console.log("Agent-based chat implementation initialized");
}

// Function to get conversation history from the chat
function getConversationHistory() {
    const history = [];
    const messages = $('#chat-messages .message');

    messages.each(function (i, el) {
        const $el = $(el);
        let role, content;

        if ($el.hasClass('user-message')) {
            role = 'user';
            content = $el.text().replace('You:', '').trim();
        } else if ($el.hasClass('ai-message')) {
            role = 'assistant';
            // Get just the message content, not the source info
            content = $el.clone().children('.source-info').remove().end().text().replace('AI:', '').trim();
        }

        if (role && content) {
            history.push({ role, content });
        }
    });

    return history;
}

// Function to scroll chat to bottom
function scrollToBottom() {
    const chatMessages = document.getElementById('chat-messages');
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
