import * as fs from "fs";
import * as path from "path";
import { createObjectCsvWriter as createCsvWriter } from "csv-writer";
import moment from "moment";

// Interface for PaymentDetail
interface PaymentDetail {
  DepositDate: string;
  AccountNumber: string;
  CustomerName: string;
  ReferenceNumber: string;
  PaymentAmount: string;
  City: string;
  DonationNumber: string;
  DonationCategory: string;
}

interface SummaryData {
  DepositDate: string;
  TotalPaymentAmount: number;
}
// Function to validate account number based on the fixed pattern: 3 chars, 5 digits, and letters
function isValidAccountNumber(accountNumber: string): boolean {
  if (accountNumber.length <= 8) return false;

  const city = accountNumber.substring(0, 3); // First 3 charss
  const donationNumber = accountNumber.substring(3, 8); // Next 5 chars are digits
  const donationCategory = accountNumber.substring(8); // Rest is suffix (letters)

  return (
    /^[a-zA-Z]+$/.test(city) &&
    /^[0-9]+$/.test(donationNumber) &&
    /^[a-zA-Z]+$/.test(donationCategory)
  );
}

// Function to read all files from a folder
function readFilesFromFolder(folderPath: string): string[] {
  return fs
    .readdirSync(folderPath)
    .filter((file) => file.endsWith(".TXT"))
    .map((file) => path.join(folderPath, file));
}

// Function to process the files and generate grouped CSVs
function processFiles(inputFolderPath: string, outputFolderPath: string): void {
  // Get all files in the folder
  const inputFiles = readFilesFromFolder(inputFolderPath);

  const paymentDetails: PaymentDetail[] = [];

  inputFiles.forEach((filePath) => {
    const lines = fs.readFileSync(filePath, "utf-8").split("\n");

    let depositDate = "";

    lines.forEach((line) => {
      const trimmedLine = line.trim();

      // Extract the deposit date from the header line
      if (trimmedLine.includes("PAYMENT DATE")) {
        depositDate = moment(
          trimmedLine.split(":")[2].trim(),
          "YY/MM/DD"
        ).format("YYYY-MM-DD");
      } else {
        // Process account number if valid
        const accountNumber = trimmedLine.substring(9, 27).trim();
        if (isValidAccountNumber(accountNumber)) {
          const customerName = trimmedLine.substring(26, 52).trim();
          const referenceNumber = trimmedLine.substring(52, 58).trim();
          const paymentAmount = trimmedLine.substring(64).trim();

          const city = accountNumber.substring(0, 3);
          const donationNumber = accountNumber.substring(3, 8);
          const donationCategory = accountNumber.substring(8);

          // Create PaymentDetail object and add to the list
          paymentDetails.push({
            DepositDate: depositDate,
            AccountNumber: accountNumber,
            CustomerName: customerName,
            ReferenceNumber: referenceNumber,
            PaymentAmount: paymentAmount,
            City: city,
            DonationNumber: donationNumber,
            DonationCategory: donationCategory,
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
      DepositDate: detail.DepositDate.replace(/\//g, "-"),
      PaymentAmount: detail.PaymentAmount,
      DonationCategory: detail.DonationCategory,
      CustomerName: detail.CustomerName,
    });
    return acc;
  }, {} as { [key: string]: any[] });

  //Generate summary page by date

  const summary = paymentDetails.reduce((acc, detail) => {
    if (!acc.find((s) => s.DepositDate == detail.DepositDate)) {
      acc.push({
        DepositDate: detail.DepositDate,
        TotalPaymentAmount: 0,
      });
    }

    const data = acc.find((s) => s.DepositDate == detail.DepositDate);
    if (data) {
      data.TotalPaymentAmount += Number(detail.PaymentAmount);
    }
    return acc;
  }, [] as SummaryData[]);

  const summaryOutputFile = path.join(outputFolderPath, `summary.csv`);
  const csvSummryWriter = createCsvWriter({
    path: summaryOutputFile,
    header: ["DepositDate", "TotalPaymentAmount"],
  });

  console.log(summary);
  csvSummryWriter
    .writeRecords(summary)
    .then(() => {
      console.log(`Generated summary at ${summaryOutputFile}`);
    })
    .catch((err: Error) => {
      console.error("Error writing summary file", err);
    });

  // Generate a CSV file for each prefix
  Object.keys(groupedData).forEach((city) => {
    const outputFilePath = path.join(outputFolderPath, `${city}_donations.csv`);

    // Create CSV writer
    const csvWriter = createCsvWriter({
      path: outputFilePath,
      header: [
        "DonationNumber",
        "DepositDate",
        "PaymentAmount",
        "DonationCategory",
      ],
    });

    // Write the grouped data for the current city
    csvWriter
      .writeRecords(groupedData[city])
      .then(() => {
        console.log(`Generated file for city '${city}' at ${outputFilePath}`);
      })
      .catch((err: Error) => {
        console.error("Error writing CSV file:", err);
      });
  });

  console.log("Data processing complete.");
}

// Set folder paths
const inputFolderPath = "./reports";
const outputFolderPath = "./output";

// Create the output folder if it doesn't exist
if (!fs.existsSync(outputFolderPath)) {
  fs.mkdirSync(outputFolderPath);
}

// Process the files and generate output
processFiles(inputFolderPath, outputFolderPath);
