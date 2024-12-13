import net from 'net';
import axios from 'axios';

let tcpClient: net.Socket | undefined = undefined;

let tcpIngressOverHTTP: net.Socket | undefined = undefined;
let tcpEgressOverHTTP: net.Socket | undefined = undefined;

async function main() {
  console.log("trying to connect to ingress and egress");

  const [tcpIngressRes, tcpEgressRes] = await Promise.all([
    axios.post("http://localhost:3000/tcp/ingress", undefined, {
      responseType: 'stream',
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    }),

    axios.post("http://localhost:3000/tcp/egress", undefined, {
      responseType: 'stream',
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    })
  ])

  console.log("connected to ingress and egress");

  tcpIngressOverHTTP = tcpIngressRes.data.socket as net.Socket;

  // - Flush HTTP method/headers through the ingress side since the client pushes data to the server
  // - The egress side never receives HTTP method/heads from the client because data flow is only one way server -> client
  tcpIngressOverHTTP.write(`POST /tcp/ingress HTTP/1.1\r\n`
  + `Transfer-Encoding: chunked\r\n`
  + `\r\n`);

  tcpIngressOverHTTP.on("close", () => {
    console.log("tcpIngressOverHTTP closed");
    tcpIngressOverHTTP = undefined;
  })
  tcpIngressOverHTTP.on("error", (err) => {
    console.log("tcpIngressOverHTTP error:", JSON.stringify(err));
    tcpIngressOverHTTP = undefined;
  })
  tcpIngressOverHTTP.on("end", () => {
    console.log("tcpIngressOverHTTP ended");
    tcpIngressOverHTTP = undefined;
  })

  tcpEgressOverHTTP = tcpEgressRes.data as net.Socket;
  tcpEgressOverHTTP.on("data", (chunk) => {
    console.log("tcpEgressOverHTTP recieved:", chunk.toString());

    if (!tcpClient) {
      createTCPClient();
    }

    if (tcpClient) {
      tcpClient.write(chunk);
    } else {
      console.log("unable to write to tcpClient.. does not exist");
    }
  });

  console.log("end of main...");
}

function createTCPClient() {
  const socket = new net.Socket();
  tcpClient = socket;

  socket.connect(22, "localhost", () => {
    console.log(`Connected to localhost:22`);
  });

  socket.on('data', (chunk: Buffer) => {
    console.log(`tcpClient received: ${chunk.toString()}`);

    if (tcpIngressOverHTTP) {
      tcpIngressOverHTTP.write(transferEncodingChunk(chunk), (err) => {
        if (err) {
          console.log("tcpIngressOverHTTP error writing chunk:", JSON.stringify(err));
        }
      });
    } else {
      console.log("unable to write to tcpIngressOverHTTP.. does not exist");
    }
  });

  socket.on('end', () => {
    console.log('Disconnected from server');
    tcpClient = undefined;
  });

  socket.on('error', (err) => {
    console.error(`Client error: ${err.message}`);
    tcpClient = undefined;
  });

  socket.on('close', () => {
    console.log('Client connection closed');
    tcpClient = undefined;
  });
}

function transferEncodingChunk(buffer: Buffer) {
  const hexLength = (buffer.length - 2).toString(16);
  const out = Buffer.concat([Buffer.from(`${hexLength}\r\n`),  buffer]);
  return out;
}

main().catch(console.error);

