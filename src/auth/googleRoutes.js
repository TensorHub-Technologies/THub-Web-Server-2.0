import express from "express"
const express=express();
import { googleUser } from "./googleControllers";

const googleRouter=express.Router();

googleRouter.post("/google",googleUser);

export default googleRouter;