// @ts-ignore
const Websocket = require('ws');

const ws = new Websocket('ws://localhost:8191');
ws.on('open', function open() {
    ws.send('something');
});

interface Animal {
    doNoise(): void;
}

class Dog implements Animal {
    doNoise(): void {
        console.log("woof");
    }
}

class Cat implements Animal {
    doNoise(): void {
        console.log("meow");
    }
}

const dog = new Dog();
dog.doNoise();
const cat = new Cat();
cat.doNoise();
let animals: Animal[] = [dog, cat];
animals.forEach(animal => animal.doNoise());