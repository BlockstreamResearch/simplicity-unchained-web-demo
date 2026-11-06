export const DEFAULT_POLICY_SOURCE = `fn main() {
    assert!(jet::le_64(jet::tx_fee(), 1000));
    assert!(jet::le_64(jet::current_script_debit(), 100000));
    jet::bip_0340_verify(
        (jet::cooperative_user_pubkey(), jet::policy_transaction_approval_hash()),
        witness::APPROVAL
    );
}`;
