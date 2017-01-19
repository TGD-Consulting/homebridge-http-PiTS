/*
 * Homebridge-Plugin for PiTS-Sensors (temperature, humidity, air/pressure)
 *
 * Sensor Request example URL:
 * http://192.168.0.10:8080/cgi-bin/homebridge.html?sensor=76&type=temperature
 *
 * Sensor returns 
 * {"value":"55.6"}
 *
 * License: MIT
 * 
 * (C) TGD, 2017
 */

var Service, Characteristic;
var inherits = require('util').inherits;
var request = require('request');

var temperatureService;
var humidityService;
var url
var humidity = 0;
var temperature = 0;

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    ////////////////////////////// Custom characteristics //////////////////////////////
    EveAirPressure = function() {
        //todo: only rough guess of extreme values -> use correct min/max if known
        Characteristic.call(this, 'Eve AirPressure', 'E863F10F-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
            format: Characteristic.Formats.UINT16,
            unit: "hPa",
            maxValue: 1085,
            minValue: 870,
            minStep: 1,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
        });
        this.value = this.getDefaultValue();
    };
    inherits(EveAirPressure, Characteristic);

    EveWeatherService = function(displayName, subtype) {
        Service.call(this, displayName, 'E863F001-079E-48FF-8F27-9C2605A29F52', subtype);
        // Required Characteristics
        this.addCharacteristic(Characteristic.CurrentTemperature);
        // Optional Characteristics
        this.addOptionalCharacteristic(Characteristic.CurrentRelativeHumidity);
        this.addOptionalCharacteristic(EveAirPressure);
    };
    inherits(EveWeatherService, Service);

    homebridge.registerAccessory(
                "homebridge-httpPiTS",  // PluginName
                "HttpPiTS",             // accessoryName
                HttpPiTS                // constructor
    );
}

// Get data from config file 
function HttpPiTS(log, config) {
    this.log = log;
	this.debug = config["debug"] || false;
	this.debug && this.log('HttpPiTS: reading config');

    // url info
    this.url = config["url"];
    this.http_method = config["http_method"] || "GET";
    this.name = config["name"];
    this.service = config["service"];
    this.manufacturer = config["manufacturer"] || "TGD-Consulting";
    this.model = config["model"] || "PiTS-It!";
    this.serial = config["serial"] || "PiTS Serial";
    this.valueTemperature = config["valueTemperature"];
    this.valueHumidity = config["valueHumidity"];
    this.valueAirPressure = config["valueAirPressure"];

	this.temperatureService;
	this.humidityService;
        this.pressureService;
}

HttpPiTS.prototype = {

    httpRequest: function (url, method, callback) {
		this.debug && this.log('httpRequest: '+method+' '+url);
        request({
                    uri: url,
                    method: method,
                    rejectUnauthorized: false
                },
                function (error, response, body) {
                    callback(error, response, body)
                })
    },

    getCurrentHumidity: function(callback){
	callback(null, this.valueHumidity);
    },

    getCurrentAirPressure: function(callback){
        callback(null, this.valueAirPressure);
    },

    getCurrent: function (callback) {
        var body;

	var res = request(this.http_method, this.url, {});
	if(res.statusCode > 400){
	  this.debug && this.log('HTTP power function failed');
	  callback(error);
	} else {
	  this.debug && this.log('HTTP power function succeeded!');
          var info = JSON.parse(res.body);

          if(this.valueTemperature !== false)
            temperatureService.setCharacteristic(Characteristic.CurrentTemperature, info.temperature);
          if(this.valueHumidity !== false)
            humidityService.setCharacteristic(Characteristic.CurrentRelativeHumidity, info.humidity);
          if(this.valueAirPressure !== false)
            pressureService.setCharacteristic(EveAirPressure, info.airpressure);

          this.log(res.body);
          this.log(info);

          if(this.valueTemperature !== false)
            this.valueTemperature = info.temperature;
          if(this.valueHumidity !== false)
            this.valueHumidity = info.humidity;
          if(this.valueAirPressure !== false)
            this.valueAirPressure = info.airpressure;

	  callback(null, this.temperature);
	}
    },

    identify: function (callback) {
        this.debug && this.log("Identify requested!");
        callback(); // success
    },

    getServices: function () {
        this.debug && this.log("getServices");
        var informationService = new Service.AccessoryInformation();

        informationService
                .setCharacteristic(Characteristic.Manufacturer, 'PiTS: ' + this.manufacturer)
                .setCharacteristic(Characteristic.Model, 'PiTS: ' + this.model)
                .setCharacteristic(Characteristic.SerialNumber, 'PiTS sensor: ' + this.serial);
        // services.push(informationService);

        var services = [informationService];

        // Create primary service
        switch (this.service) {

            case "TemperatureSensor":
                this.primaryservice = new Service.TemperatureSensor(this.name);
                this.primaryservice.getCharacteristic(Characteristic.CurrentTemperature)
                .setProps({ minValue: -55, maxValue: 125 })
                    .on('get', this.getCurrent.bind(this));
                break;

            case "HumiditySensor":
                this.primaryservice = new Service.HumiditySensor(this.name);
                this.primaryservice.getCharacteristic(Characteristic.CurrentRelativeHumidity)
                    .on('get', this.getCurrentHumidity.bind(this));
                break;

            case "FakeEveWeatherSensor":
                this.primaryservice = new EveWeatherService("Eve Weather");
                this.primaryservice.getCharacteristic(Characteristic.CurrentTemperature)
                    .on('get', this.getCurrent.bind(this));
                break;

            case "FakeEveWeatherSensorWithLog":
                this.primaryservice = new EveWeatherService("Eve Weather");
                this.primaryservice.getCharacteristic(Characteristic.CurrentTemperature)
                    .on('get', this.getCurrent.bind(this));
                break;

            default:
                this.debug && this.log.warn('WARN: Service %s %s unknown, skipping...', this.service, this.name);
                break;
        }

        services = services.concat(this.primaryservice);
        if (services.length === 1) {
            this.debug && this.log.warn("WARN: Only the InformationService was successfully configured for " + this.name + "! No device services available!");
            return services;
        }

        var service = services[1];

        // Add optional characteristics...
        if (this.valueTemperature && (this.service != "TemperatureSensor") && (this.service != "FakeEveWeatherSensor") && (this.service != "FakeEveWeatherSensorWithLog")) {
            service.addCharacteristic(Characteristic.CurrentTemperature)
            .setProps({ minValue: -55, maxValue: 125 })
                .on('get', this.getCurrent.bind(this));
        }
        if (this.valueHumidity && (this.service != "HumiditySensor")) {
            service.addCharacteristic(Characteristic.CurrentRelativeHumidity)
            .setProps({minValue: 0, maxValue: 100})
                .on('get', this.getCurrentHumidity.bind(this));
        }
        if (this.valueAirPressure && (this.service != "AirPressureSensor") && (this.service != "PressureSensor")) {
            service.addCharacteristic(EveAirPressure)
                .on('get', this.getCurrentAirPressure.bind(this));
        }

        return services;
    }
};
