import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { ConnectClient, StartChatContactCommand } from '@aws-sdk/client-connect';
import {
  ConnectParticipantClient,
  CreateParticipantConnectionCommand,
  SendMessageCommand
} from '@aws-sdk/client-connectparticipant';

const app = express();
const port = 5001; //change port number

app.use(cors());
app.use(express.json());

// Start Chat Endpoint
app.post('/api/start-chat', async (req, res) => {
  try {
    // Initialize Connect Client
    const connectClient = new ConnectClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    // Start Chat
    const startChatCmd = new StartChatContactCommand({
      InstanceId: process.env.AWS_INSTANCE_ID,
      ContactFlowId: process.env.AWS_CONTACT_FLOW_ID,
      ParticipantDetails: { 
        DisplayName: req.body.displayName || 'Customer' 
      },
    });

    const startResponse = await connectClient.send(startChatCmd);

    // Initialize Participant Client
    const participantClient = new ConnectParticipantClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    // Create Connection
    const connCmd = new CreateParticipantConnectionCommand({
      ParticipantToken: startResponse.ParticipantToken,
      Type: ['WEBSOCKET', 'CONNECTION_CREDENTIALS'],
    });

    const connResponse = await participantClient.send(connCmd);

    // Response Data
    const responseData = {
      contactId: startResponse.ContactId,
      participantToken: startResponse.ParticipantToken,
      connectionToken: connResponse.ConnectionCredentials?.ConnectionToken,
      websocketUrl: connResponse.Websocket?.Url,
    };

    res.json(responseData);

  } catch (error) {
    console.error('Chat Error:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'ChatInitializationError',
      message: error.message,
      code: error.$metadata?.httpStatusCode || 500
    });
  }
});

// Send Message Endpoint
app.post('/api/send-message', async (req, res) => {
  const { connectionToken, content } = req.body;

  if (!connectionToken || !content) {
    return res.status(400).json({
      error: 'MissingParameters',
      message: 'connectionToken and content are required'
    });
  }

  try {
    const client = new ConnectParticipantClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    const command = new SendMessageCommand({
      ConnectionToken: connectionToken,
      Content: content,
      ContentType: 'text/plain',
    });

    const response = await client.send(command);
    
    res.json({
      success: true,
      messageId: response.Id,
      messageTimestamp: response.AbsoluteTime
    });

  } catch (error) {
    console.error('Message Error:', {
      name: error.name,
      message: error.message,
      code: error.$metadata?.httpStatusCode
    });

    res.status(500).json({
      error: 'MessageSendError',
      message: error.message,
      code: error.$metadata?.httpStatusCode || 500
    });
  }
});

app.listen(port, () => {
  console.log(`Chat API running at http://localhost:${port}`);
});
