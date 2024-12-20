import * as fs from "fs";
import * as path from "path";
import { createObjectCsvWriter as createCsvWriter } from "csv-writer";
import moment from "moment";
import {parse} from 'csv-parse/sync'

// Interface for PaymentDetail
interface PaymentDetail {
  TransactionDate:string | undefined,
  PaymentNumber: string;
  AccountNumber: string;
  CustomerName: string;
  ReferenceNumber: string;
  PaymentAmount: string;
  City: string;
  DonationNumber: string;
  DonationCategory: string;
}

interface SummaryData {
  PaymentNumber: string;
  TotalPaymentAmount: number;
}

interface RejectedData {
  PaymentNumber:string;
  Line:string
}

interface TransactionData{
  PaymentNumber:string,
  Date:string
}

interface Transaction {
  'Account Number': string,
  Currency: string,
  Date: string,
  Description: string,
  Withdrawals: string,
  Deposits: string,
  Balance: string,
  Backdated: string
}


// Function to validate account number based on the fixed pattern: 3 chars, 5 digits, and letters
function isValidAccountNumber(accountNumber: string): boolean {
  if (accountNumber.length <= 8) return false;

  const city = accountNumber.substring(0, 3); // First 3 chars
  const donationNumber = accountNumber.substring(3, 8); // Next 5 chars are digits
  const donationCategory = accountNumber.substring(8); // Rest is suffix (letters)

  return (
    /^[a-zA-Z]+$/.test(city) &&
    /^[0-9]+$/.test(donationNumber) &&
    /^[a-zA-Z]+$/.test(donationCategory)
  );
}

 function readTransactionFile(filename:string): any {
  const content =  fs.readFileSync(filename, "utf-8");
  const records = parse(content,{
    columns:true,
    skip_empty_lines: true
  });
  return records;
}
// Function to read all files from a folder
function readFilesFromFolder(folderPath: string, extension:string): string[] {
  return fs
    .readdirSync(folderPath)
    .filter((file) => file.endsWith(extension))
    .map((file) => path.join(folderPath, file));
}
const regex = new RegExp("/", 'g');
//Extract payment number with date
function extractTransactionData() : Map<string,string> {

  const transactionsFiles = readFilesFromFolder(transactionFolderPath,'.csv');
  let transactions:Transaction[] = [];
  transactionsFiles.forEach((filename) => {
     const trans = readTransactionFile(filename);
     if(trans){
      transactions.push(...trans);
     }
  });

 const data:(TransactionData| undefined)[]=  transactions.map((t:Transaction) => {
    if(t.Description) {
      if(t.Description.includes("EDI") || t.Description.includes("BPY"))
      {
        return  <TransactionData>{PaymentNumber:t.Description.substring(4).trim(), Date:t.Date.replace(regex,"-")};
      }
    }
  });

  return new Map(data.filter(d => d != undefined).map(obj => [obj.PaymentNumber, obj.Date]));
}

// Function to process the files and generate grouped CSVs
function processFiles(inputFolderPath: string, outputFolderPath: string,transactionFolderPath:string): void {
  // Get all files in the folder
  const inputFiles = readFilesFromFolder(inputFolderPath,'.TXT');
  console.log(`Total files:  ${inputFiles.length} `);

  const paymentNumberList = extractTransactionData();

  const paymentDetails: PaymentDetail[] = [];
  const rejectedData:RejectedData[] = [];
  inputFiles.forEach((filePath,index) => {
    const lines = fs.readFileSync(filePath, "utf-8").split("\n");
    console.log(`Reading ${index+1}`);
    let paymentNumber = "";

    lines.forEach((line) => {
      const trimmedLine = line.trim();

      // Extract the deposit date from the header line
      if (trimmedLine.includes("PAYMENT DATE")) {
        paymentNumber =  trimmedLine.substring(14, 30).trim();
      } else {
        // Process account number if valid
        const accountNumber = trimmedLine.substring(9, 27).trim();
        if (isValidAccountNumber(accountNumber)) {
          const customerName = trimmedLine.substring(26, 52).trim();
          const referenceNumber = trimmedLine.substring(52, 58).trim();
          const paymentAmount = trimmedLine.substring(64).trim();

          const city = accountNumber.substring(0, 3).toUpperCase();
          const donationNumber = accountNumber.substring(3, 8);
          const donationCategory = accountNumber.substring(8).toUpperCase();

          // Create PaymentDetail object and add to the list
          paymentDetails.push({
            TransactionDate: paymentNumberList.get(paymentNumber),
            PaymentNumber: paymentNumber,
            AccountNumber: accountNumber,
            CustomerName: customerName,
            ReferenceNumber: referenceNumber,
            PaymentAmount: paymentAmount,
            City: city,
            DonationNumber: donationNumber,
            DonationCategory: donationCategory,
          });
        } else if(moment(trimmedLine.substring(0,8),"YY/MM/DD").isValid()) {

          rejectedData.push(
            {
              PaymentNumber:paymentNumber,
              Line:trimmedLine
          });
        }
      }
    });
  });

  // Group the data by Prefix
  const groupedData = paymentDetails.reduce((acc, detail) => {
    if (!acc[detail.City]) {
      acc[detail.City] = [];
    }
    acc[detail.City].push({
      DonationNumber: detail.DonationNumber,
      PaymentNumber: detail.PaymentNumber,
      PaymentAmount: detail.PaymentAmount,
      DonationCategory: detail.DonationCategory,
      CustomerName: detail.CustomerName,
      TransactionDate:detail.TransactionDate
    });
    return acc;
  }, {} as { [key: string]: any[] });

  
  //Generate summary page by date

  const summary = paymentDetails.reduce((acc, detail) => {
    if (!acc.find((s) => s.PaymentNumber == detail.PaymentNumber)) {
      acc.push({
        PaymentNumber: detail.PaymentNumber,
        TotalPaymentAmount: 0,
      });
    }

    const data = acc.find((s) => s.PaymentNumber == detail.PaymentNumber);
    if (data) {
      data.TotalPaymentAmount += Number(detail.PaymentAmount);
    }
    return acc;
  }, [] as SummaryData[]);


  const totalAmountSummary = summary.reduce((total,summary) => {
    return summary.TotalPaymentAmount + total;
  }, 0);

  console.log('Total Amount Summary',totalAmountSummary);

  const totalAmountPayment = paymentDetails.reduce((total,summary) => {
    return Number(summary.PaymentAmount) + total;
  }, 0);

  console.log('Total Amount from Payments list',totalAmountPayment);
  GenerateSummaryFile(summary, outputFolderPath);

  GenerateRejectedInputFile(outputFolderPath, rejectedData);

  // Generate a CSV file for each prefix
  Object.keys(groupedData).forEach((city) => {
    const outputFilePath = path.join(outputFolderPath, `${city}_donations.csv`);

    // Create CSV writer
    const csvWriter = createCsvWriter({
      path: outputFilePath,
      header: [
        "DonationNumber",
        "TransactionDate",
        "PaymentAmount",
        "DonationCategory",
      ],
    });

    // Write the grouped data for the current city
    csvWriter
      .writeRecords(groupedData[city])
      .then(() => {
      })
      .catch((err: Error) => {
      });
  });

  console.log("Data processing complete.");
}

// Set folder paths
const inputFolderPath = "./reports";
const outputFolderPath = "./output";
const transactionFolderPath = "./transactions";

// Create the output folder if it doesn't exist
if (!fs.existsSync(outputFolderPath)) {
  fs.mkdirSync(outputFolderPath);
}

// Process the files and generate output
processFiles(inputFolderPath, outputFolderPath,transactionFolderPath);
function GenerateRejectedInputFile(outputFolderPath: string, rejectedData: RejectedData[]) {
  const rejectedDataOutputFile = path.join(outputFolderPath, `rejectedinput.csv`);
  const rejectedDataWriter = createCsvWriter({
    path: rejectedDataOutputFile,
    header: ["PaymentNumber", "Line"]
  });


  rejectedDataWriter
    .writeRecords(rejectedData)
    .then(() => {
    })
    .catch((err: Error) => {
    });
}

function GenerateSummaryFile(summary: SummaryData[], outputFolderPath: string) {
  let orderSummary = summary.sort((a, b) => a.PaymentNumber.localeCompare(b.PaymentNumber));
  const summaryOutputFile = path.join(outputFolderPath, `summary.csv`);
  const csvSummryWriter = createCsvWriter({
    path: summaryOutputFile,
    header: ["PaymentNumber", "TotalPaymentAmount"],
  });

  csvSummryWriter
    .writeRecords(orderSummary)
    .then(() => {
    })
    .catch((err: Error) => {
    });
}

