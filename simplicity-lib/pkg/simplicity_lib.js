/* @ts-self-types="./simplicity_lib.d.ts" */

import * as wasm from "./simplicity_lib_bg.wasm";
import { __wbg_set_wasm } from "./simplicity_lib_bg.js";
__wbg_set_wasm(wasm);
wasm.__wbindgen_start();
export {
    compile, convert_script, encode_script, liquid_policy_address, liquid_policy_context, liquid_policy_create_pset, liquid_policy_evaluate, liquid_policy_finalize_pset, liquid_policy_generate_blinding_key, liquid_policy_local_tweak, liquid_policy_recovery_script, liquid_policy_registry, liquid_policy_unblind_output, liquid_policy_user_sign, liquid_policy_verify_signed_pset, policy_context, policy_create_psbt, policy_finalize_psbt, policy_local_tweak, policy_registry, policy_verify_signed_psbt
} from "./simplicity_lib_bg.js";
