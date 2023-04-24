# smsgw-tester-api

#### This application is meant to be used for performance or functionality testing smpp processing systems such as sms centers, clients or sms gateways.

The application is capable of hosting any number of smpp clients or centers. The centers automatically accept any smpp connections while the clients can be connected/bound/disconnected at will.

---
## General use

The api is meant to be used along with the [web application](https://github.com/PhatDave/smsgw-tester-web) but can also be used standalone via http requests. The request examples can be found in the insomnia export file (although they are outdated as of 1.0).

The web view consists of a Client and Center segment. Each entity has it's 3 parameters (for a client those are the url [the client connects to], the username and password, for the center those are the port [the center listens on], username and password) of which 2 are modifiable (username and password).

Each entity can be configured to send one smpp message or multiple smpp messages at a given rate (of messages per second).

Each entity also includes a live graph representing the incoming and outgoing traffic.

Each entity also supports a set of pre and post processors that in some way modify the incoming or outgoing pdu. These processors will be described in the processor segment.

Entities can also be deleted by **double clicking** the delete button.

Currently it is not possible to temporarily disable entities but this is planned for a future release (as of 1.0).

### Center modes of operation

Center entities are "special" in the sense that they can have a few different modes of operation.

As of 1.0 the following modes are implemented (and later described in the center postprocessor segment): "Debug", Echo and DeliveryReport.

- **Debug mode** (1.0)
	- Only "Deliver\_sm Reply" is enabled, the center does not reply to messages with any other messages and only acknowledges the ones delivered to it.
- **Echo mode** (1.0)
	- "Echo PDU" is enabled, the center replies to messages with a copy of the received message whose source and destination fields have been swapped.
	- For example a center receiving a message (src:123, dst:321) will reply to it with a message (src:321, dst:123) where the text of the message is the same as the text of the received message.
- **Delivery Report mode** (1.0)
	- "Delivery Receipt" is enabled, the center replies to messages with delivery report. You can learn more about delivery reports [here](https://smpp.org/smpp-delivery-receipt.html)
	- Details of the implementation can be found in the last segment, Delivery Reports

Enabling multiple modes at once will have the center send more than one reply message at once. For example enabling echo mode and delivery report mode will have the center reply with an echo message and a delivery report at the same time.

---
## Processors

Processors handle the majority of this application's functionality. On the web application active processors are highlighted green and they can be toggled by clicking on the appropriate button.

Preprocessors generally do something with the message before it is sent while postprocessors generally reply to a message.

These are the available pre and post processors per entity:

### Client Preprocessors

#### Destination & Source Enumerator (1.0)

These processors append an incrementing 4 digit number to the end of either the source or destination. For example given a destination of "3851728381" and destinationEnumerator toggled on, sending 5 messages would have their destinations be:
- 38517283810000
- 38517283810001
- 38517283810002
- 38517283810003
- 38517283810004

The functionality is identical for source enumerator.

#### Delivery Receipt Request (1.0)

This preprocessor adds a field to the pdu (registered\_delivery) and sets it to 1. This signals to the smsc that a delivery report is requested to this message.

#### Long SMS (1.0)

With this preprocessor enabled the messages body is chopped up into segments based on the encoding and maximum size of an smpp message given that encoding and each segment is sent separately. (Message segment information is set in the form of udh)

**With this preprocessor disabled any message whose body exceeds the maximum smpp message size is truncated to size**.

### Center Preprocessors

None as of 1.0


### Client Postprocessors

#### Deliver\_sm Reply (1.0)

This postprocessor should never be disabled (unless you know what you're doing). It enables the client to reply to deliver\_sm pdus. (deliver\_sm -> deliver\_sm\_resp)


### Center Postprocessors

#### Bind Transciever Reply (1.0)

This postprocessor should never be disabled (unless you know what you're doing). It enables client authentication. (By replying to bind\_transceiver pdus)

#### Submit\_sm Reply (1.0)

This postprocessor should never be disabled (unless you know what you're doing). It enables the center to reply to submit\_sm pdus. (submit\_sm -> submit\_sm\_resp)

#### Enquire Link Reply (1.0)

This postprocessor should never be disabled (unless you know what you're doing). It replies to the clients "heartbeat" (the enquire\_link pdu). (enquire\_link -> enquire\_link\_resp)

#### Echo PDU (1.0)

This is the first "real" postprocessor for center entities. It is one of 3 (as of 1.0) choices of center operation.

The "Echo" mode of operation has the center reply to any submit\_sm with a deliver\_sm whose message body is the same (as the submit\_sm) and source and destination swapped.

For example, sending a submit\_sm with the source of "1234" and a destination of "4321" and text of "test123" will have the center reply with a deliver\_sm with the source of "4321" and destination of "1234" with the text "test123".

#### Delivery Receipt (1.0)

The "most important" postprocessor for an smsc the delivery receipt postprocessor handles generating and sending delivery reports. You can read more about delivery reports in the Delivery Reports section.

---
## Delivery Reports

Upon receiving a submit_sm on the center whose "Delivery Receipt" postprocessor has been enabled it:
- Checks whether the pdus "registered_delivery" field is set
- Generates a delivery report in the form of `id:<messageId> sub:001 dlvrd:001 submit date:<date> done date:<date> stat:DELIVERD err:000 text:`
	- The messageId here is the one id returned in the submit_sm_resp
	- The date is simply the current date as of generation of the DR
- Sets the newly generated pdu esm class to 04
- Sends the pdu (delivery report) back to the client