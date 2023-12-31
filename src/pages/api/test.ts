import fs from "fs";
import PDFParser, { Output } from "pdf2json";
import path from "path";
import { NextApiRequest, NextApiResponse } from "next";
import { createChatCompletion } from "@/server/open-ai/ai";

export type ParsedPdf = {
    pages: {
        number: string;
        content: string[];
    }[]
}

async function loadPdf(filePath: string): Promise<Output> {
    return new Promise<any>((resolve, reject) => {
        
        const pdfParser = new PDFParser();
        pdfParser.on("pdfParser_dataError", errData => reject(errData) );
        pdfParser.on("pdfParser_dataReady", pdfData => {
            resolve(pdfData);
        });
        pdfParser.loadPDF(filePath);
    });
}

async function parsePdf(content:Output): Promise<ParsedPdf> {
    const results: ParsedPdf = {
        pages: []
    }
    for(const i in content.Pages) {
        
        const lines: Record<string, string[]> = {};
        const page = content.Pages[i];
        for(const textIndex in page.Texts) {
            const text = page.Texts[textIndex];
            const lineId = text.y;
            if (lines[lineId] === undefined) {
                lines[lineId] = [];
            }
            lines[lineId].push(text.R?.map((item) => decodeURI(item.T)).join(""));
        }        
        results.pages.push({
            number: i,
            content: Object.values(lines).map((item) => item.join(" "))
        });
    }

    return results;
}

export type JobAdvertisement = {
    job_title: string;
    overview: string;
    responsibilities: string[];
    required_skills: string[];
    selection_criteria: {category: string, description: string}[]
}

export type JobResponse = {
    name: string;
    address: string;
    contact_number: string;
    objective: string;
    profile: string;
    skills: string[];
}

async function analysePdf(content: ParsedPdf): Promise<JobAdvertisement> {
    const promptParts: string[] = ["Please extract information from a job advertisement and return a response in the same format as the following example data:"];
    const exampleResponse = {
        "job_title": "{job_title}",
        "overview": "{overview}",
        "responsibilities": [
            "{item 1}", 
            "{item 2}"
        ],
        "required_skills": [
            "{item 1}", 
            "{item 2}"
        ],
        "selection_criteria": [{
            "category": "{category}",
            "description": "{description}"
        }]
    }
    promptParts.push(JSON.stringify(exampleResponse));
    promptParts.push("The job information is below:");
    promptParts.push(JSON.stringify(content));

    const responseText = await createChatCompletion(promptParts.join("\n"));
    return JSON.parse(responseText);
}

async function createResume(content: JobAdvertisement): Promise<JobResponse> {
    const promptParts: string[] = ["Please assist me in applying for a job. The job application will need to be created in the following format:"];
    const exampleResume: JobResponse = {
        name: "[name]",
        address:"[address]",
        contact_number: "[contact_number]",
        objective: "{objective}",
        profile: "{profile}",
        skills: ["{skill 1}", "{skill 2}"],
    }

    promptParts.push(JSON.stringify(exampleResume));

    promptParts.push("The job that I am applying for is in JSON data and is as follows:");
    
    promptParts.push(JSON.stringify(content));

    promptParts.push("You must also:");
    promptParts.push("1 - Ensure the skills meet the selection criteria.");
    promptParts.push("2 - Respond in the json data.");

    const responseText = await createChatCompletion(promptParts.join("\n"));
    return  JSON.parse(responseText);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const filePath = path.resolve(__dirname,"../../../../files");
    const file = path.resolve(filePath,"file_2.pdf");
    const pdfData = await loadPdf(file);
    const parsedPdf = await parsePdf(pdfData);
    const processed = await analysePdf(parsedPdf);

    const response = await createResume(processed); 
    const result = {
        advertisement: processed,
        resume: response
    }
    

    res.json(result ?? {error: "No data"});
}