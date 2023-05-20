const express = require('express')
const request = require('request')
const app = express()
const fs = require('fs');
const { promisify } = require('util')
const readFile = promisify(fs.readFile)
const GPT_MODE = process.env.GPT_MODE

console.log("GPT_MODE is " + GPT_MODE)
console.log("History length is " + process.env.HISTORY_LENGTH)

let prompt = "You are a helpful Twitch Chatbot."

const messages = [
  {role: "system", content: prompt}
];

const user_prompts = [
];

const bot_answers = [
];

if (!["LIMITED", "FULL", "PROMPT"].includes(GPT_MODE)) {
    throw new Error('Unknown parameter GPT_MODE. Please, use one of the following:\nLIMITED\nFULL\nPROMPT\n')
} else {
    const file = "./file_context.txt"
    const encoding = 'utf-8'

    fs.readFile(file, encoding, function(err, data) {
        if (err) throw err;
        console.log("Reading context file and adding it as system level message for the agent.")
        prompt = data;
        console.log(prompt);
        messages[0].content = prompt;
    });
}

app.use(express.json({extended: true, limit: '1mb'}))

app.all('/', (req, res) => {
    console.log("Just got a request!")
    res.send('Yo!')
})


function count_user_messages(){
    let user_messages = 0;

    messages.forEach((m) => {
        if (m.role === 'user') {
            ++user_messages;
        }
    });
    
    return user_messages
}


function send_answer(response, res){
    if (response.data.choices) {
        var agent_response;
        if(GPT_MODE === "PROMPT"){
            agent_response = response.data.choices[0].text
        } else{
            agent_response = response.data.choices[0].message.content
        }
        
        console.log("Agent answer: " + agent_response)
        messages.push({role: "assistant", content: agent_response})
        bot_answers.push(agent_response)
        //prompt = prompt + agent_response;
        
        //Check for Twitch max. chat message length limit and slice if needed
        if(agent_response.length > 399){
            console.log("Agent answer exceeds twitch chat limit. Slicing to first 399 characters.")
            agent_response = agent_response.substring(0, 399)
            console.log("Sliced agent answer: " + agent_response)
        }

        res.send(agent_response)
    } else {
        res.send("Something went wrong. Try again later!")
    }
}


app.get('/gpt/:text', async (req, res) => {
    
    //The agent should receive Username:Message in the text to identify conversations with different users in his history. 
    
    let text = req.params.text
    console.log(req.params)
    console.log(text)
    const { Configuration, OpenAIApi } = require("openai");

    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const openai = new OpenAIApi(configuration);
    var response;
    const colons = ':'

    text = text.slice(0, text.indexOf(colons)) + colons + ' ' + text.slice(text.indexOf(colons)+1).split('+').join(' ')  
  
    if(user_prompts.includes(text)){
        res.send(bot_answers[user_prompts.indexOf(text)])
    } else if (GPT_MODE !== "PROMPT"){
        //CHAT MODE EXECUTION
   
        //Add user message to  messages
        messages.push({role: "user", content: text})
        user_prompts.push(text)
        
        if (GPT_MODE === "LIMITED") {
            //Check if message history is exceeded
            if (count_user_messages() > process.env.HISTORY_LENGTH){
                console.log('Message amount in history exceeded. Removing oldest user and agent messages.')
                messages.splice(1,2)
                user_prompts.splice(1,2)
                bot_answers.splice(1,2)
          }
        }
      
        response = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: messages,
            temperature: 0.5,
            max_tokens: 128,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
        });
    } else {
        //PROMPT MODE EXECUTION
        prompt = prompt + "\n\nQ:" + text + "\nA:";

        response = await openai.createCompletion({
            model: "text-davinci-003",
            prompt: prompt,
            temperature: 0.5,
            max_tokens: 128,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
        });
    }
    
    send_answer(response, res)
})


app.listen(process.env.PORT || 3000)
