# Copyright (c) 2024, Centura AG and contributors
# For license information, please see license.txt

import os
import csv
import frappe
from frappe import _
from datetime import datetime
import xml.etree.ElementTree as ET


@frappe.whitelist()
def import_camt(xml_file, company, bank_account):
    try:
        csv_file_doc = parse_xml_to_csv(xml_file, company, bank_account)
        bank_statement_import = create_new_bank_statement_import(
            csv_file_doc, company, bank_account)
        bank_statement_import.start_import()
        delete_csv_doc_and_file(csv_file_doc)
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), _("CAMT Import Error"))
        frappe.throw(_("Error importing CAMT file: {0}").format(str(e)))


def parse_xml_to_csv(xml_file, company, bank_account):
    try:
        timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
        site_path = frappe.utils.get_site_path()
        csv_file_path = os.path.join(
            site_path, "private", "files", f"camt-{timestamp}.csv")

        xml_file_path = os.path.join(site_path, xml_file.lstrip('/'))
        tree = ET.parse(xml_file_path)
        root = tree.getroot()

        namespace = {'ns': get_namespace(root)}
        entries = root.findall('.//ns:Ntry', namespace)

        header = ['Date', 'Company', 'Bank Account', 'Deposit',
                  'Withdrawal', 'Reference Number', 'Description']
        with open(csv_file_path, 'w', newline='') as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(header)
            for entry in entries:
                booking_date = entry.find('./ns:BookgDt/ns:Dt', namespace).text
                amount = entry.find('./ns:Amt', namespace).text or '0'
                is_credit = entry.find(
                    './ns:CdtDbtInd', namespace).text == 'CRDT'
                deposit, withdrawal = (amount, 0) if is_credit else (0, amount)
                reference = entry.find('.//ns:CdtrRefInf/ns:Ref', namespace)
                reference = reference.text if reference is not None else entry.find(
                    './/ns:AcctSvcrRef', namespace).text
                description = entry.find('./ns:AddtlNtryInf', namespace).text

                writer.writerow([booking_date, company, bank_account,
                                deposit, withdrawal, reference, description])

        file_doc = frappe.get_doc({
            "doctype": "File",
            "file_name": f"camt-{timestamp}.csv",
            "file_path": csv_file_path,
            "file_url": f"/private/files/camt-{timestamp}.csv",
            "is_private": 1
        })
        file_doc.insert(ignore_permissions=True)
        return file_doc
    except Exception as e:
        frappe.throw(_("Error parsing XML: {0}").format(str(e)))


def create_new_bank_statement_import(csv_file_doc, company, bank_account):
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
        frappe.throw(
            _("Error creating Bank Statement Import: {0}").format(str(e)))


def delete_csv_doc_and_file(csv_doc):
    try:
        frappe.delete_doc("File", csv_doc.name, ignore_permissions=True)
        os.remove(csv_doc.file_path)
    except Exception as e:
        frappe.throw(
            _("Error deleting CSV file: {0}").format(str(e)))


def get_namespace(element):
    return element.tag.split('}')[0][1:] if '}' in element.tag else ''
