# Copyright (c) 2024, Centura AG and contributors
# For license information, please see license.txt

import os
import csv
import frappe
import zipfile
from frappe import _
from datetime import datetime
import xml.etree.ElementTree as ET


@frappe.whitelist()
def import_camt(file, company, bank_account):
    try:
        xml_file_list = extract_xml_files(file)
        if not xml_file_list:
            frappe.throw(_("No valid XML files found in the provided input."))

        csv_file_doc = parse_xml_to_csv(xml_file_list, company, bank_account)
        bank_statement_import = create_new_bank_statement_import(
            csv_file_doc, company, bank_account
        )
        bank_statement_import.start_import()
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), _("CAMT Import Error"))
        frappe.throw(_("Error importing CAMT file: {0}").format(str(e)))


def extract_xml_files(file):
    """Extract XML files from a ZIP or directly add an XML file."""
    try:
        xml_file_list = []
        file_path = '/private/files/temp_camt_zip_extracted/'

        if file.endswith('.zip'):
            zip_folder_path = frappe.get_site_path() + file_path
            with zipfile.ZipFile(frappe.get_site_path() + file, 'r') as zip_ref:
                zip_ref.extractall(zip_folder_path)
                extracted_files = os.listdir(zip_folder_path)

                # Adjust file path if there's a folder matching the ZIP name
                file_name = file.split('/')[-1].replace('.zip', '')
                if file_name in extracted_files:
                    file_path += file_name + '/'

                # Collect XML files
                xml_file_list = [
                    f"{file_path}{filename}"
                    for filename in os.listdir(frappe.get_site_path() + file_path)
                    if filename.endswith('.xml')
                ]
        elif file.endswith('.xml'):
            xml_file_list.append(file)
        else:
            frappe.throw(_("Unsupported file format. Please provide a ZIP or XML file."))

        return xml_file_list
    except Exception as e:
        frappe.throw(_("Error extracting files: {0}").format(str(e)))


def parse_xml_to_csv(xml_file_list, company, bank_account):
    """Parse XML files to generate a CSV document."""
    try:
        timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
        site_path = frappe.utils.get_site_path()
        csv_file_path = os.path.join(site_path, "private", "files", f"camt-{timestamp}.csv")

        write_csv_from_xml(xml_file_list, csv_file_path, company, bank_account)

        return create_csv_file_doc(csv_file_path, timestamp)
    except Exception as e:
        frappe.throw(_("Error parsing XML: {0}").format(str(e)))


def write_csv_from_xml(xml_file_list, csv_file_path, company, bank_account):
    """Write entries from XML files into a CSV."""
    header = ['Date', 'Company', 'Bank Account', 'Deposit', 'Withdrawal', 'Reference Number', 'Description']
    with open(csv_file_path, 'w', newline='') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(header)

        for xml_file in xml_file_list:
            process_xml_file(writer, xml_file, company, bank_account)


def process_xml_file(writer, xml_file, company, bank_account):
    """Process a single XML file and write entries to CSV."""
    site_path = frappe.utils.get_site_path()
    xml_file_path = os.path.join(site_path, xml_file.lstrip('/'))
    tree = ET.parse(xml_file_path)
    root = tree.getroot()

    namespace = {'ns': get_namespace(root)}
    entries = root.findall('.//ns:Ntry', namespace)

    for entry in entries:
        booking_date = entry.find('./ns:BookgDt/ns:Dt', namespace).text
        amount = float(entry.find('./ns:Amt', namespace).text or '0')
        is_credit = entry.find('./ns:CdtDbtInd', namespace).text == 'CRDT'
        deposit, withdrawal = (amount, 0) if is_credit else (0, amount)
        reference = get_reference(entry, namespace)
        description = entry.find('./ns:AddtlNtryInf', namespace).text or ''

        writer.writerow([booking_date, company, bank_account, deposit, withdrawal, reference, description])


def get_reference(entry, namespace):
    """Extract reference from XML entry."""
    reference = entry.find('.//ns:CdtrRefInf/ns:Ref', namespace)
    if reference is not None:
        return reference.text
    acct_svcr_ref = entry.find('.//ns:AcctSvcrRef', namespace)
    return acct_svcr_ref.text if acct_svcr_ref is not None else ''


def create_csv_file_doc(csv_file_path, timestamp):
    """Create and insert a File document for the CSV."""
    file_doc = frappe.get_doc({
        "doctype": "File",
        "file_name": f"camt-{timestamp}.csv",
        "file_path": csv_file_path,
        "file_url": f"/private/files/camt-{timestamp}.csv",
        "is_private": 1
    })
    file_doc.insert(ignore_permissions=True)
    return file_doc


def create_new_bank_statement_import(csv_file_doc, company, bank_account):
    """Create a Bank Statement Import document."""
    try:
        bank_statement_import = frappe.new_doc("Bank Statement Import")
        bank_statement_import.company = company
        bank_statement_import.bank_account = bank_account
        bank_statement_import.import_file = csv_file_doc.file_url
        bank_statement_import.reference_doctype = "Bank Transaction"
        bank_statement_import.import_type = "Insert New Records"
        bank_statement_import.template_options = '{"column_to_field_map": {}}'
        bank_statement_import.insert(ignore_permissions=True)
        return bank_statement_import
    except Exception as e:
        frappe.throw(_("Error creating Bank Statement Import: {0}").format(str(e)))


def get_namespace(element):
    """Extract namespace from an XML element."""
    return element.tag.split('}')[0][1:] if '}' in element.tag else ''
