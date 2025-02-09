// Copyright (c) 2025, Centura AG and contributors
// For license information, please see license.txt

// frappe.ui.form.on("Transaction Matching Tool", {
// 	refresh(frm) {

// 	},
// });


frappe.ui.form.on('Transaction Matching Tool', {
  setup: function (frm) {
    frm.set_query('bank_account', function (doc) {
      return {
        filters: {
          company: doc.company,
          is_company_account: 1
        }
      };
    });
  },

  onload: function (frm) {
    if (!frm.doc.bank_statement_from_date && !frm.doc.bank_statement_to_date) {
      // Set default filter dates
      let today = frappe.datetime.get_today();
      frm.doc.bank_statement_from_date = frappe.datetime.add_months(today, -1);
      frm.doc.bank_statement_to_date = today;
    }

    if (!frm.doc.company) {
      // set default company
      frm.doc.company = frappe.user_defaults.company;
    }

    if (!frm.doc.bank_account) {
      // get default bank account by filtering for company, is_company_account and is_default
      frappe.db.get_value('Bank Account', { company: frm.doc.company, is_company_account: 1, is_default: 1 }, 'name', (r) => {
        if (r.name) {
          frm.set_value('bank_account', r.name);
        }
      });
    }
  },

  filter_by_reference_date: function (frm) {
    if (frm.doc.filter_by_reference_date) {
      frm.set_value('bank_statement_from_date', '');
      frm.set_value('bank_statement_to_date', '');
    } else {
      frm.set_value('from_reference_date', '');
      frm.set_value('to_reference_date', '');
    }
  },

  refresh: function (frm) {
    frm.disable_save();
    frm.fields_dict['filters_section'].collapse(false);

    frm.page.add_action_icon('refresh', () => {
      frm.events.get_bank_transactions(frm);
    });
    frm.change_custom_button_type(__('Get Bank Transactions'), null, 'primary');

    frm.add_custom_button(__('Import Data from camt-File'), () => {
      frappe.prompt(
        {
          label: 'Attach camt-File (ZIP or XML File)',
          fieldtype: 'Attach',
          fieldname: 'file',
          reqd: 1
        },
        (values) => {
          frappe.call({
            method:
              'camt_import.camt_import.doctype.transaction_matching_tool.transaction_matching_tool.import_camt',
            args: {
              file: values.file,
              company: frm.doc.company,
              bank_account: frm.doc.bank_account
            },
            callback: function (r) {
              if (!r.exc) {
                frappe.msgprint(__('CAMT File Import started'));
                frm.refresh();
              }
            },
            error: function (r) {
              frappe.msgprint({
                title: __('Error'),
                message: r.message || __('An error occurred'),
                indicator: 'red'
              });
            }
          });
        }
      );
    });

    frm.page.add_menu_item(__('Auto Reconcile'), function () {
      frappe.confirm(
        __(
          'Auto reconcile bank transactions based on matching reference numbers?'
        ),
        () => {
          frappe.call({
            method:
              'camt_import.camt_import.doctype.transaction_matching_tool.transaction_matching_tool.auto_reconcile_vouchers',
            args: {
              bank_account: frm.doc.bank_account,
              from_date: frm.doc.bank_statement_from_date,
              to_date: frm.doc.bank_statement_to_date,
              filter_by_reference_date: frm.doc.filter_by_reference_date,
              from_reference_date: frm.doc.from_reference_date,
              to_reference_date: frm.doc.to_reference_date
            },
            freeze: true,
            freeze_message: __('Auto Reconciling ...'),
            callback: (r) => {
              if (!r.exc) {
                frm.refresh();
              }
            }
          });
        }
      );
    });

    frm.page.add_menu_item(__('Upload a Bank Statement'), () =>
      frm.events.route_to_bank_statement_import(frm)
    );

    frm.$reconciliation_area = frm.get_field(
      'reconciliation_action_area'
    ).$wrapper;
    frm.events.setup_empty_state(frm);

    frm.events.build_reconciliation_area(frm);
  },

  get_bank_transactions: function (frm) {
    if (!frm.doc.bank_account) {
      frappe.throw({
        message: __("Please set the 'Bank Account' filter"),
        title: __('Filter Required')
      });
    }

    frm.events.build_reconciliation_area(frm);
  },

  route_to_bank_statement_import(frm) {
    frappe.open_in_new_tab = true;

    if (!frm.doc.bank_account || !frm.doc.company) {
      frappe.new_doc('Bank Statement Import');
      return;
    }

    // Route to saved Import Record in new tab
    frappe.call({
      method:
        'erpnext.accounts.doctype.bank_reconciliation_tool.bank_reconciliation_tool.upload_bank_statement',
      args: {
        dt: frm.doc.doctype,
        dn: frm.doc.name,
        company: frm.doc.company,
        bank_account: frm.doc.bank_account
      },
      callback: function (r) {
        if (!r.exc) {
          var doc = frappe.model.sync(r.message);
          frappe.open_in_new_tab = true;
          frappe.set_route('Form', doc[0].doctype, doc[0].name);
        }
      }
    });
  },

  bank_account: function (frm) {
    if (frm.doc.bank_account) {
      frappe.db.get_value(
        'Bank Account',
        frm.doc.bank_account,
        'account',
        (r) => {
          frappe.db.get_value('Account', r.account, 'account_currency', (r) => {
            frm.doc.account_currency = r.account_currency;
            frm.trigger('get_account_opening_balance');
            frm.trigger('get_account_closing_balance');
          });
        }
      );

      frm.events.get_bank_transactions(frm);
    } else {
      frm.events.setup_empty_state(frm);
    }
  },

  bank_statement_from_date: function (frm) {
    frm.trigger('get_account_opening_balance');
    frm.trigger('get_bank_transactions');
  },

  bank_statement_to_date: function (frm) {
    frm.trigger('get_account_closing_balance');
    frm.trigger('get_bank_transactions');
  },
  
  get_account_opening_balance(frm) {
    if (frm.doc.bank_account && frm.doc.bank_statement_from_date) {
      frappe.call({
        method:
          'erpnext.accounts.doctype.bank_reconciliation_tool.bank_reconciliation_tool.get_account_balance',
        args: {
          bank_account: frm.doc.bank_account,
          till_date: frm.doc.bank_statement_from_date,
          company: frm.doc.company
        },
        callback: (response) => {
          frm.set_value('account_opening_balance', response.message);
        }
      });
    }
  },

  get_account_closing_balance(frm) {
    if (frm.doc.bank_account && frm.doc.bank_statement_to_date) {
      return frappe.call({
        method:
          'erpnext.accounts.doctype.bank_reconciliation_tool.bank_reconciliation_tool.get_account_balance',
        args: {
          bank_account: frm.doc.bank_account,
          till_date: frm.doc.bank_statement_to_date,
          company: frm.doc.company
        },
        callback: (response) => {
          frm.cleared_balance = response.message;
        }
      });
    }
  },

  setup_empty_state: function (frm) {
    frm.$reconciliation_area.empty();
    frm.$reconciliation_area.append(`
              <div class="bank-reco-beta-empty-state">
                  <p>
                      ${__('Please select a Bank Account to start reconciling.')}
                  </p>
              </div>
          `);
  },

  build_reconciliation_area: function (frm) {
    if (!frm.doc.bank_account) return;

    frappe.require(
      'transaction_matching_tool.bundle.js',
      () =>
      (frm.panel_manager =
        new erpnext.accounts.transaction_matching_tool.PanelManager({
          doc: frm.doc,
          $wrapper: frm.$reconciliation_area,
          endpoints: {
            create_journal_entry: 'camt_import.camt_import.doctype.transaction_matching_tool.transaction_matching_tool.create_journal_entry_bts',
            create_payment_entry: 'camt_import.camt_import.doctype.transaction_matching_tool.transaction_matching_tool.create_payment_entry_bts'
          }
        }))
    );
  }
});
