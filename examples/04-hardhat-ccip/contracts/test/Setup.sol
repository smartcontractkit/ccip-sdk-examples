// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CCIPLocalSimulator} from "@chainlink/local/src/ccip/CCIPLocalSimulator.sol";

/// @dev Re-export CCIPLocalSimulator so Hardhat generates an artifact for it.
contract LocalSimulator is CCIPLocalSimulator {}
