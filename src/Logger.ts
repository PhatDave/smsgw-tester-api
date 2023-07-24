import {WriteStream} from "fs";

const fs = require('fs');

const LOG_LEVEL: number = Number(process.env.LOG_LEVEL) || 0;
const LOG_FILE: string = process.env.LOG_FILE || "";

export default class Logger {
    log1 = this.log.bind(this, 1);
    log2 = this.log.bind(this, 2);
    log3 = this.log.bind(this, 3);
    log4 = this.log.bind(this, 4);
    log5 = this.log.bind(this, 5);
    log6 = this.log.bind(this, 6);
    private clazz: string;
    private readonly logLevel: number;
    private readonly logFile: string;
    private readonly logFileWriteStream: WriteStream | null = null;

    constructor(clazz: string) {
        this.clazz = clazz;
        this.logLevel = LOG_LEVEL;
        this.logFile = LOG_FILE;

        if (!!this.logFile) {
            this.logFileWriteStream = fs.createWriteStream(this.logFile, {flags: 'a'});
        }
    }

    leftPad(str: string, len: number, char: string): string {
        str = String(str);
        let i: number = -1;
        len = len - str.length;
        if (char === undefined) {
            char = " ";
        }
        while (++i < len) {
            str = char + str;
        }
        return str;
    }

    log(logLevel: number, data: any): void {
        if (typeof data === "object") {
            data = JSON.stringify(data);
        }
        let date = new Date();

        let year: string = this.leftPad(String(date.getFullYear()), 4, '0');
        let month: string = this.leftPad(String(date.getMonth() + 1), 2, '0');
        let day: string = this.leftPad(String(date.getDate()), 2, '0');

        let hours: string = this.leftPad(String(date.getHours()), 2, '0');
        let minutes: string = this.leftPad(String(date.getMinutes()), 2, '0');
        let seconds: string = this.leftPad(String(date.getSeconds()), 2, '0');
        let milliseconds: string = this.leftPad(String(date.getMilliseconds()), 3, '0');

        let datePrefix: string = `[${day}/${month}/${year}-${hours}:${minutes}:${seconds}:${milliseconds}]`

        let out: string = datePrefix.padEnd(30, ' ') + `[${this.clazz}]`.padEnd(28, ' ') + `(${logLevel})`.padEnd(8, ' ') + data;
        if (logLevel <= this.logLevel) {
            console.log(out);
        }
        if (!!this.logFileWriteStream) {
            this.logFileWriteStream.write(out + "\n");
        }
    }
}
