const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const https = require('https');

const app = express();
const PORT = 3000; // Change this to your desired port
const SECRET_KEY = 'test123'; // Change this to your own secret key

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const filePath = path.join(__dirname, 'client-secrets.txt');
const filePathTickets = path.join(__dirname, 'tickets.txt');
const filePathTicketsIndex = path.join(__dirname, 'tickets_index.txt');
const faker = require('faker');


app.use(bodyParser.json());

const allowedClients = [{
  clientId: "sadff",
  clientSecret: ""
}]

var userAuthenticated = false;

// Middleware to check for JWT authentication
const authenticateJWT = (req, res, next) => {
  const token = req.header('Authorization').split(' ')[1];

  if (!token) {
    return res.status(401).json({
      message: 'Authentication failed'
    });
  }

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {

      console.log('Token Verification Error:', err.message + "\n" + err + "\n" + token );
      return res.status(403).json({
        message: err
      });
    }

    req.user = user;
    next();
  });
};
app.get('/tickets/:number', authenticateJWT, (req, res) => {
  const ticketNumber = req.params.number;
  const ticketIndexes = getTicketsIndex();
  const foundTicketIndex = ticketIndexes[ticketNumber];
  

  if (foundTicketIndex != undefined) {
    let tickets = getTickets();
    let ticket = tickets[foundTicketIndex];
    res.json({
      ticket
    });

  } else {
    res.status(404).json({
      message: 'Ticket not found'
    });
  }

  //res.json(getTickets());
});

// GET all tickets
app.get('/tickets', authenticateJWT, (req, res) => {
  res.json(getTickets());
});

// GET specific ticket


// POST a new ticket
app.post('/tickets', authenticateJWT, (req, res) => {
  const newTicket = req.body;

  const tickets = getTickets();
  tickets.push(newTicket);
  let arrayIndex = tickets.length;

  let ticketsIndex = getTicketsIndex();
  if (ticketsIndex.toString() === "{}" || ticketsIndex[newTicket.number] != undefined) {
    res.status(400).json({
      message: 'Ticket with the same number already exists!'
    });
  } else {

    ticketsIndex[newTicket.number] = arrayIndex - 1;
    saveTickets(tickets);
    saveTicketsIndex(ticketsIndex);

    console.log(newTicket);
    // ticketsDB.push(newTicket);
    res.status(201).json({
      message: 'Ticket created successfully'
    });
  }
});

// PUT (update) a ticket
app.put('/tickets/:number', authenticateJWT, (req, res) => {
  const ticketNumber = req.params.number;
  const updatedTicket = req.body;

  let ticketIndexes = getTicketsIndex();
  const foundTicketIndex = ticketIndexes[ticketNumber];
  if (foundTicketIndex != undefined) {
    let tickets = getTickets();
    
    if(tickets[foundTicketIndex].number != updatedTicket.number){
      delete ticketIndexes[ticketNumber] ;
      ticketIndexes[updatedTicket.number] = foundTicketIndex;
      saveTicketsIndex(ticketIndexes);
    }

    tickets[foundTicketIndex] = {
      ...tickets[foundTicketIndex],
      ...updatedTicket
    };

    saveTickets(tickets);
    res.json({
      message: 'Ticket updated successfully',
    });

  } else {
    res.status(404).json({
      message: 'Ticket not found'
    });
  }

});

// DELETE a ticket
app.delete('/tickets/:number', authenticateJWT, (req, res) => {
  const ticketNumber = req.params.number;

  const ticketIndexes = getTicketsIndex();
  const foundTicketIndex = ticketIndexes[ticketNumber];

  if (foundTicketIndex != undefined) {
    let tickets = getTickets();

    tickets.splice(foundTicketIndex, 1);
    delete ticketIndexes[ticketNumber];
    
    for(let i = foundTicketIndex; i< tickets.length; i++){
      ticketIndexes[tickets[i].number] = i;
    }

    saveTickets(tickets);
    saveTicketsIndex(ticketIndexes);

    setTimeout(() => {
      res.json({
        message: 'Ticket deleted successfully'
      });
    }, "500");

  } else {
    res.status(404).json({
      message: 'Ticket not found'
    });
  }

});

// Token generation route (for simplicity, you can enhance this to use a proper login mechanism)
app.post('/token_oauth', (req, res) => {
  const {
    client_id,
    client_secret,
  } = req.body;
  const clientSecrets = getClientSecrets();


  if (clientSecrets.filter((application) => application.clientId == client_id && application.clientSecret == client_secret)) {
    const token = jwt.sign({
      client_id
    }, SECRET_KEY, {
      expiresIn: '10m'
    });
    res.json({
      token
    });
  } else {
    res.status(401).json({
      message: 'Authentication failed! \n Please check your client id and client secret and try again!'
    });
  }
});



app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

function validateInstance(username, password, InstanceID) {

  const options = {
    hostname: InstanceID + '.service-now.com',
    path: '/api/now/table/sys_user?sysparm_query=user_name%3D' + username + '&sysparm_fields=user_name&sysparm_limit=1',
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Authorization': 'Basic ' + Buffer.from(username + ':' + password).toString('base64')
    }
  };
  var result = false;

  const req = https.get(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      var resultOBJ = JSON.parse(data);

      userAuthenticated = resultOBJ.result[0].user_name == username;;
    });
    console.log(res.statusCode);



  });

  req.on('error', (error) => {

    console.error(error);
  });

  req.end();
}


app.post('/register', (req, res) => {
  const {
    username,
    password,
    instanceId
  } = req.body;
  validateInstance(username, password, instanceId)

  setTimeout(() => {

    if (userAuthenticated) {
      const clientSecrets = getClientSecrets();
      const application = clientSecrets.length === 0 ? false : clientSecrets.filter((application) => application.instanceId == instanceId).length !== 0;
      const test = clientSecrets.filter((application) => application.instanceId == instanceId).length !== 0;
      const test2 = clientSecrets.filter((application) => application.instanceId == instanceId).toString();

      if (!application) {
        const newClientSecret = {
          clientId: generateHash(),
          clientSecret: generateHash(),
          instanceId: instanceId
        };
        clientSecrets.push(newClientSecret);
        saveClientSecrets(clientSecrets);

        res.status(201).json({
          message: 'Application registered successfully! \n Please take note of the client ID and client secret for authentication.',
          client_id: newClientSecret.clientId,
          client_secret: newClientSecret.clientSecret
        });
      } else {
        res.status(400).json({
          message: 'Application is already registered!'
        });
      }
    } else {
      res.status(401).json({
        message: 'User is not authorized!'
      });
    }
  }, "1450");
});



// Function to read the client secrets from the text file
function getClientSecrets() {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    if (!data) return [];
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading client secrets:', err);
    return [];
  }
}

// Function to write client secrets to the text file
function saveClientSecrets(clientSecrets) {
  try {
    const data = JSON.stringify(clientSecrets, null, 2);
    fs.writeFileSync(filePath, data, 'utf8');
    console.log('Client secrets saved successfully.');
  } catch (err) {
    console.error('Error saving client secrets:', err);
  }
}



function getTickets() {
  try {
    const data = fs.readFileSync(filePathTickets, 'utf8');
    if (!data) return [];
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading client secrets:', err);
    return [];
  }
}

// Function to write client secrets to the text file
function saveTickets(tickets) {
  try {
    const data = JSON.stringify(tickets, null, 2);
    fs.writeFileSync(filePathTickets, data, 'utf8');
    console.log('tickets saved successfully.');
  } catch (err) {
    console.error('Error saving tickets:', err);
  }
}


function getTicketsIndex() {
  try {
    const data = fs.readFileSync(filePathTicketsIndex, 'utf8');
    if (!data) return [];
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading client secrets:', err);
    return [];
  }
}

// Function to write client secrets to the text file
function saveTicketsIndex(ticketsIndex) {
  try {
    const data = JSON.stringify(ticketsIndex, null, 2);
    fs.writeFileSync(filePathTicketsIndex, data, 'utf8');
    console.log('tickets saved successfully.');
  } catch (err) {
    console.error('Error saving tickets:', err);
  }
}




function generateHash() {
  return crypto.randomBytes(16).toString('hex');
}


