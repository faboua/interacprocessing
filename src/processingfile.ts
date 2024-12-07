import * as fs from "fs";
import * as path from "path";
import { createObjectCsvWriter as createCsvWriter } from "csv-writer";

// Interface for PaymentDetail
interface PaymentDetail {
  DepositDate: string;
  AccountNumber: string;
  CustomerName: string;
  ReferenceNumber: string;
  PaymentAmount: string;
  Prefix: string;
  NumericPart: string;
  Suffix: string;
}

// Function to validate account number based on the fixed pattern: 3 chars, 5 digits, and letters
function isValidAccountNumber(accountNumber: string): boolean {
  if (accountNumber.length <= 8) return false;

  const prefix = accountNumber.substring(0, 3); // First 3 charss
  const numericPart = accountNumber.substring(3, 8); // Next 5 chars are digits
  const suffix = accountNumber.substring(8); // Rest is suffix (letters)

  return (
    /^[a-zA-Z]+$/.test(prefix) &&
    /^[0-9]+$/.test(numericPart) &&
    /^[a-zA-Z]+$/.test(suffix)
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
        depositDate = trimmedLine.split(":")[2].trim();
      } else {
        // Process account number if valid
        const accountNumber = trimmedLine.substring(9, 27).trim();
        if (isValidAccountNumber(accountNumber)) {
          const customerName = trimmedLine.substring(26, 52).trim();
          const referenceNumber = trimmedLine.substring(52, 58).trim();
          const paymentAmount = trimmedLine.substring(64).trim();

          const prefix = accountNumber.substring(0, 3);
          const numericPart = accountNumber.substring(3, 8);
          const suffix = accountNumber.substring(8);

          // Create PaymentDetail object and add to the list
          paymentDetails.push({
            DepositDate: depositDate,
            AccountNumber: accountNumber,
            CustomerName: customerName,
            ReferenceNumber: referenceNumber,
            PaymentAmount: paymentAmount,
            Prefix: prefix,
            NumericPart: numericPart,
            Suffix: suffix,
          });
        }
      }
    });
  });

  // Group the data by Prefix
  const groupedData = paymentDetails.reduce((acc, detail) => {
    if (!acc[detail.Prefix]) {
      acc[detail.Prefix] = [];
    }
    acc[detail.Prefix].push({
      NumericPart: detail.NumericPart,
      // Prefix: detail.Prefix,
      DepositDate: detail.DepositDate.replace(/\//g, "-"),
      PaymentAmount: detail.PaymentAmount,
      Suffix: detail.Suffix,
      CustomerName: detail.CustomerName,
    });
    return acc;
  }, {} as { [key: string]: any[] });

  // Generate a CSV file for each prefix
  Object.keys(groupedData).forEach((prefix) => {
    const outputFilePath = path.join(
      outputFolderPath,
      `${prefix}_donations.csv`
    );

    // Create CSV writer
    const csvWriter = createCsvWriter({
      path: outputFilePath,
      header: ["NumericPart", "DepositDate", "PaymentAmount", "Suffix"],
    });

    // Write the grouped data for the current prefix
    csvWriter
      .writeRecords(groupedData[prefix])
      .then(() => {
        console.log(
          `Generated file for prefix '${prefix}' at ${outputFilePath}`
        );
      })
      .catch((err: Error) => {
        console.error("Error writing CSV file:", err);
      });
  });

  console.log("Data processing complete.");
}

// Set folder paths
const inputFolderPath = "./reports"; // Change to your folder path
const outputFolderPath = "./output"; // Change to your desired output folder path

// Create the output folder if it doesn't exist
if (!fs.existsSync(outputFolderPath)) {
  fs.mkdirSync(outputFolderPath);
}

// Process the files and generate output
processFiles(inputFolderPath, outputFolderPath);
